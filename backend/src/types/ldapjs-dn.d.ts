declare module '@ldapjs/dn' {
  export class DN {
    static fromString(value: string): DN;
    equals(other: DN | string): boolean;
    childOf(other: DN | string): boolean;
    isEmpty(): boolean;
    toString(): string;
  }
}
