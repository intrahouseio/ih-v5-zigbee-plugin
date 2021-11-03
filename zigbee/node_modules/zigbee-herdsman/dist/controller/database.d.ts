import { DatabaseEntry, EntityType } from './tstype';
declare class Database {
    private entries;
    private path;
    private constructor();
    static open(path: string): Database;
    getEntries(type: EntityType[]): DatabaseEntry[];
    insert(DatabaseEntry: DatabaseEntry): void;
    update(DatabaseEntry: DatabaseEntry, write: boolean): void;
    remove(ID: number): void;
    has(ID: number): boolean;
    newID(): number;
    write(): void;
}
export default Database;
//# sourceMappingURL=database.d.ts.map