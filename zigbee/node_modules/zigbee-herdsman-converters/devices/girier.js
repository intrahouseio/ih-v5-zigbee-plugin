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
Object.defineProperty(exports, "__esModule", { value: true });
const tuya = __importStar(require("../lib/tuya"));
const reporting = __importStar(require("../lib/reporting"));
const definitions = [
    {
        fingerprint: [
            { modelID: 'TS0001', manufacturerName: '_TZ3000_majwnphg' },
            { modelID: 'TS0001', manufacturerName: '_TZ3000_6axxqqi2' },
            { modelID: 'TS0001', manufacturerName: '_TZ3000_zw7yf6yk' },
        ],
        model: 'JR-ZDS01',
        vendor: 'Girier',
        description: '1 gang mini switch',
        extend: tuya.extend.switch({ switchType: true }),
        configure: async (device, coordinatorEndpoint, logger) => {
            await reporting.bind(device.getEndpoint(1), coordinatorEndpoint, ['genOnOff']);
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=girier.js.map