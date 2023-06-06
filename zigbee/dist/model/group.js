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
/* eslint-disable brace-style */
const settings = __importStar(require("../util/settings"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
class Group {
    get ID() { return this.zh.groupID; }
    get options() { return { ...settings.getGroup(this.ID) }; }
    get name() { var _a; return ((_a = this.options) === null || _a === void 0 ? void 0 : _a.friendly_name) || this.ID.toString(); }
    constructor(group, resolveDevice) {
        this.zh = group;
        this.resolveDevice = resolveDevice;
    }
    hasMember(device) {
        return !!device.zh.endpoints.find((e) => this.zh.members.includes(e));
    }
    membersDevices() {
        return this.zh.members.map((e) => this.resolveDevice(e.getDevice().ieeeAddr)).filter((d) => d);
    }
    membersDefinitions() {
        return this.zh.members.map((m) => zigbee_herdsman_converters_1.default.findByDevice(m.getDevice())).filter((d) => d);
    }
    isDevice() { return false; }
    isGroup() { return true; }
}
exports.default = Group;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvbW9kZWwvZ3JvdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGdDQUFnQztBQUNoQywyREFBNkM7QUFDN0MsNEZBQWtFO0FBRWxFLE1BQXFCLEtBQUs7SUFJdEIsSUFBSSxFQUFFLEtBQVksT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFBLENBQUM7SUFDMUMsSUFBSSxPQUFPLEtBQWtCLE9BQU8sRUFBQyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQSxDQUFDO0lBQ3JFLElBQUksSUFBSSxhQUFZLE9BQU8sQ0FBQSxNQUFBLElBQUksQ0FBQyxPQUFPLDBDQUFFLGFBQWEsS0FBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUEsQ0FBQztJQUU5RSxZQUFZLEtBQWUsRUFBRSxhQUEyQztRQUNwRSxJQUFJLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUNoQixJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQztJQUN2QyxDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQWM7UUFDcEIsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRUQsY0FBYztRQUNWLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUVELGtCQUFrQjtRQUNkLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDN0Isb0NBQXdCLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQXFCLENBQUM7SUFDbkcsQ0FBQztJQUVELFFBQVEsS0FBb0IsT0FBTyxLQUFLLENBQUMsQ0FBQSxDQUFDO0lBQzFDLE9BQU8sS0FBbUIsT0FBTyxJQUFJLENBQUMsQ0FBQSxDQUFDO0NBQzFDO0FBNUJELHdCQTRCQyJ9