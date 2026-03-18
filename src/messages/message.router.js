import express from "express";
import { auth } from "../../middlewares/auth.js";
import {
    createOrGetConversation,
    createGroupConversation,
    getChatList,
    getMessages,
    markMessagesRead,
    getConversationParticipants,
    addGroupParticipants,
    removeGroupParticipant,
    leaveGroup,
    updateGroupConversation,
    setConversationPreferences,
    sendMessage,
    editMessage,
    deleteMessageForEveryone,
    deleteMessageForMe,
    getMessageReceipts,
    getUserPresence,
    getBulkPresence,
    heartbeatPresence,
} from "./message.controller.js";

const router = express.Router();

router.post("/conversations/direct", auth, createOrGetConversation);
router.post("/conversations/group", auth, createGroupConversation);
router.get("/conversations", auth, getChatList);
router.post("/conversations/:conversationId/messages", auth, sendMessage);
router.get("/conversations/:conversationId/messages", auth, getMessages);
router.patch("/conversations/:conversationId/read", auth, markMessagesRead);
router.get("/conversations/:conversationId/participants", auth, getConversationParticipants);
router.get("/messages/:messageId/receipts", auth, getMessageReceipts);
router.patch("/messages/:messageId", auth, editMessage);
router.delete("/messages/:messageId", auth, deleteMessageForEveryone);
router.delete("/messages/:messageId/me", auth, deleteMessageForMe);
router.patch("/conversations/:conversationId/preferences", auth, setConversationPreferences);
router.patch("/conversations/:conversationId/group", auth, updateGroupConversation);
router.post("/conversations/:conversationId/participants", auth, addGroupParticipants);
router.delete("/conversations/:conversationId/participants/:userId", auth, removeGroupParticipant);
router.post("/conversations/:conversationId/leave", auth, leaveGroup);

router.get("/presence", auth, getBulkPresence);
router.get("/presence/:userId", auth, getUserPresence);
router.patch("/presence/me/heartbeat", auth, heartbeatPresence);

export default router;