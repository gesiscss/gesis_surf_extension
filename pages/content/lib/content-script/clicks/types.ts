// Define the structure of click data to be collected
export interface ClickData {
    click_time: Date;
    click_type: string;
    click_target_element: string;
    click_target_tag: string;
    click_target_class: string;
    click_page_x: number;
    click_page_y: number;
    click_referrer: string;
    domain_session_id: string;
}

export interface MessageResponse {
    status: 'success' | 'error';
    message?: string;
    data?: string;
}