import Phaser from "phaser";
import { CLASSES, CLASS_IDS, ARENA_WIDTH, ARENA_HEIGHT, type ClassId } from "@new-heroes/shared";

/** Loadout screen — pick a class, then start the arena. */
export class ClassSelectScene extends Phaser.Scene {
  constructor() {
    super("classSelect");
  }

  create() {
    this.cameras.main.setBackgroundColor("#15131f");
    this.input.setDefaultCursor("default");

    this.add
      .text(ARENA_WIDTH / 2, 70, "NEW HEROES", { fontFamily: "monospace", fontSize: "40px", color: "#ffffff" })
      .setOrigin(0.5);
    this.add
      .text(ARENA_WIDTH / 2, 118, "Choose your class", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#9be29b",
      })
      .setOrigin(0.5);

    const cardW = 210;
    const cardH = 270;
    const gap = 24;
    const totalW = CLASS_IDS.length * cardW + (CLASS_IDS.length - 1) * gap;
    let x = (ARENA_WIDTH - totalW) / 2 + cardW / 2;
    const y = ARENA_HEIGHT / 2 + 30;

    for (const id of CLASS_IDS) {
      const def = CLASSES[id];
      const color = Phaser.Display.Color.HexStringToColor(def.color).color;

      const card = this.add
        .rectangle(x, y, cardW, cardH, 0x2a2740)
        .setStrokeStyle(2, color)
        .setInteractive({ useHandCursor: true });
      this.add.rectangle(x, y - cardH / 2 + 26, cardW - 2, 44, color).setAlpha(0.92);
      this.add
        .text(x, y - cardH / 2 + 26, def.name, { fontFamily: "monospace", fontSize: "20px", color: "#15131f" })
        .setOrigin(0.5);

      const stats = [
        `HP         ${def.maxHp}`,
        `Speed      ${def.moveSpeed.toFixed(1)}`,
        `Weapon     ${def.weapon.name}`,
        `Damage     ${def.weapon.damage}${def.weapon.pellets > 1 ? ` x${def.weapon.pellets}` : ""}`,
        `Fire rate  ${(1000 / def.weapon.fireCooldownMs).toFixed(1)}/s`,
        `Range      ${def.weapon.range}`,
      ].join("\n");
      this.add
        .text(x, y + 8, stats, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#dcdcf0",
          lineSpacing: 7,
          align: "left",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + cardH / 2 - 20, "CLICK TO PLAY", {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#8a86a8",
        })
        .setOrigin(0.5);

      card.on("pointerover", () => card.setFillStyle(0x3a3658));
      card.on("pointerout", () => card.setFillStyle(0x2a2740));
      card.on("pointerdown", () => this.scene.start("arena", { className: id as ClassId }));

      x += cardW + gap;
    }

    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 22, "In game: press 1 / 2 / 3 to switch class (re-deploys)", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#6f6b90",
      })
      .setOrigin(0.5);
  }
}
