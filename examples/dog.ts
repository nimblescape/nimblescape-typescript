// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// A class of the workspace: the completion of `Dog` in main.ts offers its import from ./dog.ts.

export class Dog {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  public bark(): string {
    return `${this.name}: Woof!`;
  }
}
