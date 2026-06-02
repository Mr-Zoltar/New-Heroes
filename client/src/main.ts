import Phaser from "phaser";
import { ClassSelectScene } from "./scenes/ClassSelectScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { ARENA_WIDTH, ARENA_HEIGHT } from "@new-heroes/shared";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  backgroundColor: "#222034",
  pixelArt: false,
  scene: [ClassSelectScene, ArenaScene],
});
