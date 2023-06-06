"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* istanbul ignore file */
// DEPRECATED
const settings = __importStar(require("../../util/settings"));
const logger_1 = __importDefault(require("../../util/logger"));
const utils_1 = __importDefault(require("../../util/utils"));
const extension_1 = __importDefault(require("../extension"));
/**
 * This extensions soft resets the ZNP after a certain timeout.
 */
class SoftReset extends extension_1.default {
    constructor() {
        super(...arguments);
        this.timer = null;
        this.timeout = utils_1.default.seconds(settings.get().advanced.soft_reset_timeout);
    }
    async start() {
        logger_1.default.debug(`Soft reset timeout set to ${this.timeout / 1000} seconds`);
        this.resetTimer();
        this.eventBus.onDeviceMessage(this, () => this.resetTimer());
        this.eventBus.onDeviceAnnounce(this, () => this.resetTimer());
        this.eventBus.onDeviceNetworkAddressChanged(this, () => this.resetTimer());
        this.eventBus.onDeviceJoined(this, () => this.resetTimer());
        this.eventBus.onDeviceInterview(this, () => this.resetTimer());
    }
    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    resetTimer() {
        if (this.timeout === 0) {
            return;
        }
        this.clearTimer();
        this.timer = setTimeout(() => this.handleTimeout(), this.timeout);
    }
    async handleTimeout() {
        logger_1.default.warn('Soft reset timeout triggered');
        try {
            await this.zigbee.reset('soft');
            logger_1.default.warn('Soft resetted ZNP due to timeout');
        }
        catch (error) {
            logger_1.default.warn('Soft reset failed, trying stop/start');
            await this.zigbee.stop();
            logger_1.default.warn('Zigbee stopped');
            try {
                await this.zigbee.start();
            }
            catch (error) {
                logger_1.default.error('Failed to restart!');
            }
        }
        this.resetTimer();
    }
}
exports.default = SoftReset;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29mdFJlc2V0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvc29mdFJlc2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwwQkFBMEI7QUFDMUIsYUFBYTtBQUNiLDhEQUFnRDtBQUNoRCwrREFBdUM7QUFDdkMsNkRBQXFDO0FBQ3JDLDZEQUFxQztBQUVyQzs7R0FFRztBQUNILE1BQXFCLFNBQVUsU0FBUSxtQkFBUztJQUFoRDs7UUFDWSxVQUFLLEdBQWlCLElBQUksQ0FBQztRQUMzQixZQUFPLEdBQUcsZUFBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFpRGhGLENBQUM7SUEvQ1ksS0FBSyxDQUFDLEtBQUs7UUFDaEIsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxVQUFVLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU8sVUFBVTtRQUNkLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNaLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7U0FDckI7SUFDTCxDQUFDO0lBRU8sVUFBVTtRQUNkLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxDQUFDLEVBQUU7WUFDcEIsT0FBTztTQUNWO1FBRUQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhO1FBQ3ZCLGdCQUFNLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFFNUMsSUFBSTtZQUNBLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDaEMsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQztTQUNuRDtRQUFDLE9BQU8sS0FBSyxFQUFFO1lBQ1osZ0JBQU0sQ0FBQyxJQUFJLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUVwRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDekIsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUU5QixJQUFJO2dCQUNBLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUM3QjtZQUFDLE9BQU8sS0FBSyxFQUFFO2dCQUNaLGdCQUFNLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7YUFDdEM7U0FDSjtRQUVELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0o7QUFuREQsNEJBbURDIn0=