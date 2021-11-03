export default class Group {
    zh: zh.Group;
    get ID(): number;
    get settings(): GroupSettings;
    get name(): string;
    constructor(group: zh.Group);
    membersDefinitions(): zhc.Definition[];
    isDevice(): this is Device;
    isGroup(): this is Group;
}
//# sourceMappingURL=group.d.ts.map