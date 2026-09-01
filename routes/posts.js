// server/routes/posts.js — 동네 피드 (Offleash blueprint §5)
// 마운트: app.use("/api/posts", postsRoutes)
const express = require("express");
const router = express.Router();
const { isValidObjectId } = require("mongoose");
const requireAuth = require("../middleware/requireAuth");
const Post = require("../models/Post");
const User = require("../models/User");
const Block = require("../models/Block");

router.use(requireAuth);

const TYPES = ["walk-request", "lost", "recommend", "question"];

/** meters between two [lng,lat] pairs (haversine) */
function distM(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const [lng1, lat1] = a.map(Number);
  const [lng2, lat2] = b.map(Number);
  if ([lng1, lat1, lng2, lat2].some(Number.isNaN)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

const hasCoords = (loc) => {
  const c = loc?.coordinates;
  return Array.isArray(c) && c.length === 2 && (Number(c[0]) !== 0 || Number(c[1]) !== 0);
};

function shape(post, meId, myCoords) {
  const authorDoc = post.author && post.author._id ? post.author : null;
  const comments = post.comments || [];
  const top = comments.length ? comments[comments.length - 1] : null;
  return {
    id: String(post._id),
    author: authorDoc
      ? { id: String(authorDoc._id), name: authorDoc.name || "Neighbour", faceUrl: (authorDoc.photos || []).find((p) => p.type === "owner_face")?.url }
      : { id: String(post.author), name: "Neighbour" },
    type: post.type,
    body: post.body,
    locationName: post.locationName || "",
    distanceM: hasCoords(post.location) && myCoords ? distM(myCoords, post.location.coordinates) : null,
    reactions: (post.reactions || []).length,
    reacted: (post.reactions || []).some((r) => String(r) === String(meId)),
    commentCount: comments.length,
    topComment: top
      ? {
          author: top.author && top.author.name ? top.author.name : "Neighbour",
          body: top.body,
          createdAt: top.createdAt,
        }
      : null,
    mine: String(authorDoc?._id || post.author) === String(meId),
    createdAt: post.createdAt,
  };
}

/* GET /api/posts?limit=20&type=lost — 최신순 피드 (차단 상대 제외) */
router.get("/", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const [blocks, blockedBy, meDoc] = await Promise.all([
      Block.find({ owner: me }).select("targetId").lean(),
      Block.find({ targetId: me }).select("owner").lean(),
      User.findById(me).select("location").lean(),
    ]);
    const exclude = [
      ...blocks.map((b) => String(b.targetId)),
      ...blockedBy.map((b) => String(b.owner)),
    ];

    const q = { author: { $nin: exclude } };
    if (TYPES.includes(req.query.type)) q.type = req.query.type;

    const posts = await Post.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author", "name photos")
      .populate("comments.author", "name")
      .lean();

    const myCoords = hasCoords(meDoc?.location) ? meDoc.location.coordinates : null;
    res.json(posts.map((p) => shape(p, me, myCoords)));
  } catch (e) {
    next(e);
  }
});

/* POST /api/posts { type, body } — 내 위치 스냅샷 포함 생성 */
router.post("/", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required." });
    if (body.length > 2000) return res.status(400).json({ message: "body is too long." });
    const type = TYPES.includes(req.body?.type) ? req.body.type : "question";

    const meDoc = await User.findById(me).select("location locationName").lean();
    const doc = {
      author: me,
      type,
      body,
      locationName: meDoc?.locationName || "",
    };
    if (hasCoords(meDoc?.location)) {
      doc.location = { type: "Point", coordinates: meDoc.location.coordinates };
    }
    const post = await Post.create(doc);
    const full = await Post.findById(post._id).populate("author", "name photos").lean();
    res.status(201).json(shape(full, me, null));
  } catch (e) {
    next(e);
  }
});

/* POST /api/posts/:id/react — 🐾 토글 */
router.post("/:id/react", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid post id." });
    const post = await Post.findById(id).select("reactions");
    if (!post) return res.status(404).json({ message: "Post not found." });
    const has = post.reactions.some((r) => String(r) === me);
    if (has) post.reactions = post.reactions.filter((r) => String(r) !== me);
    else post.reactions.push(me);
    await post.save();
    res.json({ ok: true, reacted: !has, reactions: post.reactions.length });
  } catch (e) {
    next(e);
  }
});

/* POST /api/posts/:id/comments { body } */
router.post("/:id/comments", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid post id." });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required." });
    if (body.length > 1000) return res.status(400).json({ message: "comment is too long." });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found." });
    post.comments.push({ author: me, body });
    await post.save();
    const meDoc = await User.findById(me).select("name").lean();
    const added = post.comments[post.comments.length - 1];
    res.status(201).json({
      ok: true,
      commentCount: post.comments.length,
      comment: { author: meDoc?.name || "Neighbour", body: added.body, createdAt: added.createdAt },
    });
  } catch (e) {
    next(e);
  }
});

/* DELETE /api/posts/:id — 작성자만 */
router.delete("/:id", async (req, res, next) => {
  try {
    const me = String(req.userId);
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid post id." });
    const post = await Post.findById(id).select("author");
    if (!post) return res.status(404).json({ message: "Post not found." });
    if (String(post.author) !== me) return res.status(403).json({ message: "Not your post." });
    await Post.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
