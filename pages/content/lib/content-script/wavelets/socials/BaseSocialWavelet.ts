import { runtime } from 'webextension-polyfill';

export interface SocialPostData {
    id: string;
    [key: string]: unknown;
}

export abstract class BaseSocialWavelet {
    protected readonly capturedIds = new Set<string>();

    abstract isSite(): boolean;
    abstract extractPost(element: HTMLElement): SocialPostData | null;
    protected abstract processAddedNode(element: HTMLElement): void;
    protected abstract readonly messageType: string;
    protected abstract readonly label: string;

    protected sendData(data: SocialPostData): void {
        runtime.sendMessage({ type: this.messageType, data })
            .then(() => console.log(`✅[${this.label}] Sent:`, data.id))
            .catch(e => console.error(`❌[${this.label}] Send failed:`, e));
    }

    private setupObserver(): void {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    this.processAddedNode(node as HTMLElement);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log(`[${this.label}] Observer active`);
    }

    initialize(): void {
        if (!this.isSite()) return;
        console.log(`[${this.label}] Initializing`);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupObserver());
        } else {
            this.setupObserver();
        }
    }
}
