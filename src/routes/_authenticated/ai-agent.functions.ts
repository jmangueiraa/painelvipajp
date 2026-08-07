import { createServerFn } from "@tanstack/react-start";
import { 
  getAgentKnowledgeLogic, 
  processAgentMessageLogic, 
  getConversationsLogic 
} from "./ai-agent.server";

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
