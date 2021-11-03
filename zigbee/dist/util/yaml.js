"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const js_yaml_1 = __importDefault(require("js-yaml"));
const fs_1 = __importDefault(require("fs"));
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
function read(file) {
    try {
        return js_yaml_1.default.load(fs_1.default.readFileSync(file, 'utf8'));
    }
    catch (error) {
        if (error.name === 'YAMLException') {
            error.file = file;
        }
        throw error;
    }
}
function readIfExists(file, default_) {
    return fs_1.default.existsSync(file) ? read(file) : default_;
}
function writeIfChanged(file, content) {
    const before = readIfExists(file);
    if (!(0, es6_1.default)(before, content)) {
        fs_1.default.writeFileSync(file, js_yaml_1.default.dump(content));
    }
}
function updateIfChanged(file, key, value) {
    const content = read(file);
    if (content[key] !== value) {
        content[key] = value;
        writeIfChanged(file, content);
    }
}
exports.default = { read, readIfExists, updateIfChanged, writeIfChanged };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieWFtbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi91dGlsL3lhbWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzREFBMkI7QUFDM0IsNENBQW9CO0FBQ3BCLDhEQUF5QztBQUV6QyxTQUFTLElBQUksQ0FBQyxJQUFZO0lBQ3RCLElBQUk7UUFDQSxPQUFPLGlCQUFJLENBQUMsSUFBSSxDQUFDLFlBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7S0FDbkQ7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNaLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUU7WUFDaEMsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7U0FDckI7UUFFRCxNQUFNLEtBQUssQ0FBQztLQUNmO0FBQ0wsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxRQUFtQjtJQUNuRCxPQUFPLFlBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0FBQ3ZELENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUFZLEVBQUUsT0FBaUI7SUFDbkQsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxJQUFBLGFBQU0sRUFBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUU7UUFDMUIsWUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsaUJBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztLQUM5QztBQUNMLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWU7SUFDL0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEtBQUssRUFBRTtRQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLGNBQWMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7S0FDakM7QUFDTCxDQUFDO0FBRUQsa0JBQWUsRUFBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUMsQ0FBQyJ9