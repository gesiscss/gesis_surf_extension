//

export interface LLMData {
    llm_provider: 'chatgpt' | 'claude' | 'deepseek' | 'gemini';
    message_type: 'user_question' | 'ai_response';
    message_content: string;
    message_id: string;
    timestamp: string;
    chat_session_id: string;
    url: string;
    page_title: string;
    domain_session_id: string;
}