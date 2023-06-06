"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
class Entity extends events_1.default.EventEmitter {
    static injectDatabase(database) {
        Entity.database = database;
    }
    static injectAdapter(adapter) {
        Entity.adapter = adapter;
    }
}
Entity.database = null;
Entity.adapter = null;
exports.default = Entity;
//# sourceMappingURL=entity.js.map