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
class Device {
    constructor(device) {
        this.zh = device;
    }
    get ieeeAddr() { return this.zh.ieeeAddr; }
    get ID() { return this.zh.ieeeAddr; }
    get settings() { return { ...settings.get().device_options, ...settings.getDevice(this.ieeeAddr) }; }
    get name() {
        var _a;
        return this.zh.type === 'Coordinator' ? 'Coordinator' : ((_a = this.settings) === null || _a === void 0 ? void 0 : _a.friendly_name) || this.ieeeAddr;
    }
    get definition() {
        if (!this._definition && !this.zh.interviewing) {
            this._definition = zigbee_herdsman_converters_1.default.findByDevice(this.zh);
        }
        return this._definition;
    }
    ensureInSettings() {
        if (this.zh.type !== 'Coordinator' && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }
    endpoint(key) {
        var _a, _b, _c;
        let endpoint;
        if (key == null || key == '')
            key = 'default';
        if (!isNaN(Number(key))) {
            endpoint = this.zh.getEndpoint(Number(key));
        }
        else if ((_a = this.definition) === null || _a === void 0 ? void 0 : _a.endpoint) {
            const ID = (_c = (_b = this.definition) === null || _b === void 0 ? void 0 : _b.endpoint) === null || _c === void 0 ? void 0 : _c.call(_b, this.zh)[key];
            if (ID)
                endpoint = this.zh.getEndpoint(ID);
            else if (key === 'default')
                endpoint = this.zh.endpoints[0];
            else
                return null;
        }
        else {
            /* istanbul ignore next */
            if (key !== 'default')
                return null;
            endpoint = this.zh.endpoints[0];
        }
        return endpoint;
    }
    endpointName(endpoint) {
        var _a, _b;
        let name = null;
        if ((_a = this.definition) === null || _a === void 0 ? void 0 : _a.endpoint) {
            name = Object.entries((_b = this.definition) === null || _b === void 0 ? void 0 : _b.endpoint(this.zh)).find((e) => e[1] == endpoint.ID)[0];
        }
        /* istanbul ignore next */
        return name === 'default' ? null : name;
    }
    isXiaomi() {
        const xiaomiManufacturerID = [4151, 4447];
        /* istanbul ignore next */
        return this.zh.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(this.zh.manufacturerID) &&
            (!this.zh.manufacturerName || !this.zh.manufacturerName.startsWith('Trust'));
    }
    isIkeaTradfri() { return this.zh.manufacturerID === 4476; }
    isDevice() { return true; }
    /* istanbul ignore next */
    isGroup() { return false; }
}
exports.default = Device;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL21vZGVsL2RldmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxnQ0FBZ0M7QUFDaEMsMkRBQTZDO0FBQzdDLDRGQUFrRTtBQUVsRSxNQUFxQixNQUFNO0lBaUJ2QixZQUFZLE1BQWlCO1FBQ3pCLElBQUksQ0FBQyxFQUFFLEdBQUcsTUFBTSxDQUFDO0lBQ3JCLENBQUM7SUFmRCxJQUFJLFFBQVEsS0FBWSxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQztJQUNqRCxJQUFJLEVBQUUsS0FBWSxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQztJQUMzQyxJQUFJLFFBQVEsS0FBb0IsT0FBTyxFQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsRUFBRSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFDLENBQUMsQ0FBQSxDQUFDO0lBQ2pILElBQUksSUFBSTs7UUFDSixPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLFFBQVEsMENBQUUsYUFBYSxLQUFJLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDMUcsQ0FBQztJQUNELElBQUksVUFBVTtRQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLEVBQUU7WUFDNUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxvQ0FBd0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQ3JFO1FBQ0QsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQzVCLENBQUM7SUFN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