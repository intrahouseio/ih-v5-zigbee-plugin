"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
    constructor(group) {
        this.zh = group;
    }
    get ID() { return this.zh.groupID; }
    get settings() { return settings.getGroup(this.ID); }
    get name() { var _a; return ((_a = this.settings) === null || _a === void 0 ? void 0 : _a.friendly_name) || this.ID.toString(); }
    membersDefinitions() {
        return this.zh.members.map((m) => zigbee_herdsman_converters_1.default.findByDevice(m.getDevice())).filter((d) => d);
    }
    isDevice() { return false; }
    isGroup() { return true; }
}
exports.default = Group;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JvdXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvbW9kZWwvZ3JvdXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsZ0NBQWdDO0FBQ2hDLDJEQUE2QztBQUM3Qyw0RkFBa0U7QUFFbEUsTUFBcUIsS0FBSztJQU90QixZQUFZLEtBQWU7UUFDdkIsSUFBSSxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUM7SUFDcEIsQ0FBQztJQU5ELElBQUksRUFBRSxLQUFZLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQSxDQUFDO0lBQzFDLElBQUksUUFBUSxLQUFtQixPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUEsQ0FBQztJQUNsRSxJQUFJLElBQUksYUFBWSxPQUFPLENBQUEsTUFBQSxJQUFJLENBQUMsUUFBUSwwQ0FBRSxhQUFhLEtBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBLENBQUM7SUFNL0Usa0JBQWtCO1FBQ2QsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUM3QixvQ0FBd0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBcUIsQ0FBQztJQUNuRyxDQUFDO0lBRUQsUUFBUSxLQUFvQixPQUFPLEtBQUssQ0FBQyxDQUFBLENBQUM7SUFDMUMsT0FBTyxLQUFtQixPQUFPLElBQUksQ0FBQyxDQUFBLENBQUM7Q0FDMUM7QUFsQkQsd0JBa0JDIn0=