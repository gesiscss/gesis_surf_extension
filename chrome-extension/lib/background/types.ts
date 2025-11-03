import { AuthService, PrivateModeService } from "../services";
import { MessageHandler } from "../messages";

export interface ServiceContainer {
    authService: AuthService;
    privateModeService: PrivateModeService;
    messageHandler: MessageHandler;
}