import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { 
  getAgentKnowledgeLogic, 
  processAgentMessageLogic, 
  getConversationsLogic,
  updateKnowledgeItemLogic,
  deleteKnowledgeItemLogic
} from "@/lib/ai-agent.server";

export const getAgentKnowledge = createServerFn({ method: "GET" })
  .handler(async () => {
    return getAgentKnowledgeLogic();
  });

export const processAgentMessage = createServerFn({ method: "POST" })
  .handler(async ({ data }: { data: any }) => {
    return processAgentMessageLogic(data);
  });

export const getConversations = createServerFn({ method: "GET" })
  .handler(async () => {
    return getConversationsLogic();
  });

export const updateKnowledgeItem = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    type: z.enum(['device', 'app', 'faq']),
    item: z.any()
  }).parse(data))
  .handler(async ({ data }) => {
    return updateKnowledgeItemLogic(data.type, data.item);
  });

export const deleteKnowledgeItem = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    type: z.enum(['device', 'app', 'faq']),
    id: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    return deleteKnowledgeItemLogic(data.type, data.id);
  });
