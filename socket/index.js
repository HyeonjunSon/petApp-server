// server/socket/index.js
const { Server } = require("socket.io");
const { isValidObjectId } = require("mongoose");
const Match = require("../models/Match");
const Message = require("../models/Message");
const socketAuth = require("./auth");

function initSocket(httpServer, corsOrigin = "*") {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // 소켓 인증 (socket.user 주입)
  socketAuth(io);

  io.on("connection", (socket) => {
    const userId = String(socket.user?._id || "");

    if (!userId) {
      // 인증 실패 시 연결 종료
      try { socket.disconnect(true); } catch {}
      return;
    }

    // 개인 알림 채널 입장
    socket.join(`user:${userId}`);

    /** 매치 방 참여 */
    socket.on("join", async ({ matchId }) => {
      try {
        if (!isValidObjectId(matchId)) return;

        // 권한: 이 매치의 멤버인지 확인
        const count = await Match.countDocuments({ _id: matchId, users: userId });
        if (!count) return;

        // 기존 match:* 방들 떠나고 새 방으로
        [...socket.rooms]
          .filter((r) => r.startsWith("match:"))
          .forEach((r) => socket.leave(r));

        socket.join(`match:${matchId}`);
        socket.emit("joined", { matchId: String(matchId) });
      } catch {}
    });

    /** 메시지 전송 */
    socket.on("message", async ({ matchId, text, clientTempId }, ack) => {
      try {
        if (!isValidObjectId(matchId) || !text?.trim()) return;

        const match = await Match.findOne({ _id: matchId, users: userId });
        if (!match) return; // 권한 없음

        const msg = await Message.create({
          match: matchId,
          from: userId,
          text: text.trim(),
          // ✅ 보낸 본인은 이미 읽음 처리
          seenBy: [userId],
        });

        // lastMessage 갱신
        match.lastMessage = msg._id;
        await match.save();

        const payload = {
          _id: String(msg._id),
          match: String(matchId),
          from: String(userId),
          text: msg.text,
          createdAt: msg.createdAt?.toISOString?.() || new Date().toISOString(),
          clientTempId,
          seenBy: [String(userId)],
        };

        // 보낸 본인에게 ACK (낙관적 ID 치환)
        if (typeof ack === "function") {
          ack({ ok: true, serverId: payload._id, clientTempId });
        }

        // 같은 방의 모두에게 새 메시지 브로드캐스트
        io.to(`match:${matchId}`).emit("message:new", payload);

        // 사이드바 최신화 신호(개인 채널)
        const last = {
          matchId: String(matchId),
          text: msg.text,
          createdAt: payload.createdAt,
          from: String(userId),
        };
        match.users.map(String).forEach((uid) => {
          io.to(`user:${uid}`).emit("match:updated", last);
        });
      } catch (e) {
        if (typeof ack === "function") ack({ ok: false, error: e.message });
      }
    });

    /** ✅ 읽음 처리: 현재 유저가 특정 메시지들을 읽음 */
    socket.on("message:read", async ({ matchId, messageIds }, ack) => {
      try {
        if (!isValidObjectId(matchId)) return;
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
          return typeof ack === "function" ? ack({ ok: true, updated: 0 }) : null;
        }

        // 이 매치의 멤버인지 확인
        const match = await Match.findOne({ _id: matchId, users: userId }).select("_id");
        if (!match) return;

        // 이 매치 소속 + 내가 보낸 게 아닌 메시지들만 대상으로 seenBy 추가
        const result = await Message.updateMany(
          { _id: { $in: messageIds }, match: matchId, from: { $ne: userId } },
          { $addToSet: { seenBy: userId } }
        );

        // 같은 방 사용자들에게 읽음 브로드캐스트
        io.to(`match:${matchId}`).emit("message:read", {
          matchId: String(matchId),
          readerId: String(userId),
          messageIds: messageIds.map(String),
        });

        if (typeof ack === "function") {
          ack({ ok: true, updated: result.modifiedCount || 0 });
        }
      } catch (e) {
        if (typeof ack === "function") ack({ ok: false, error: e.message });
      }
    });

    /** (옵션) 타이핑 표시 */
    socket.on("typing", ({ matchId, isTyping }) => {
      if (!isValidObjectId(matchId)) return;
      io.to(`match:${matchId}`).emit("typing", { userId, isTyping: !!isTyping });
    });

    socket.on("disconnect", () => {
      // 필요 시 정리 로직
    });
  });

  return io;
}

module.exports = { initSocket };
