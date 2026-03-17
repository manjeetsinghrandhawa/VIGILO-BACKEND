import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { createOrGetConversation, 
        getChatList, 
        getMessages,
    markMessagesRead,
        getConversationParticipants } from "./message.controller.js";

const router = express.Router();

router.post("/createOrGetConversation", auth, createOrGetConversation);
router.get("/getChatList/:userId", auth, getChatList);
router.get("/getMessages/:conversationId", auth, getMessages);
router.patch("/markMessagesRead",auth, markMessagesRead);
router.get("/getConversationParticipants/:conversationId", auth, getConversationParticipants);
export default router;