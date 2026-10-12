// Floor plans in metres. Walls: [x1, y1, x2, y2, material] — door openings are gaps.
// Materials are defined in model.js; the UI lets you change any wall's material.
(function (root) {
  "use strict";
  const LAYOUTS = {
    escola: {
      name: { pt: "Escola · ala de salas", en: "School · classroom wing" },
      outline: [[0, 0], [44, 0], [44, 22], [0, 22]],
      walls: [
        [0, 0, 44, 0, "masonry"], [0, 22, 44, 22, "masonry"], [0, 0, 0, 10, "masonry"], [0, 12, 0, 22, "masonry"],
        [44, 0, 44, 10, "masonry"], [44, 12, 44, 22, "masonry"],
        [0, 9, 4.5, 9, "block"], [5.7, 9, 15.5, 9, "block"], [16.7, 9, 26.5, 9, "block"], [27.7, 9, 37.5, 9, "block"],
        [38.7, 9, 44, 9, "block"],
        [0, 13, 9.5, 13, "block"], [10.7, 13, 26.5, 13, "block"], [27.7, 13, 37.5, 13, "block"], [38.7, 13, 44, 13, "block"],
        [11, 0, 11, 9, "block"], [22, 0, 22, 9, "block"], [33, 0, 33, 9, "block"], [22, 13, 22, 22, "block"],
        [33, 13, 33, 22, "block"]],
      rooms: [["Sala 1", 0, 0, 11, 9], ["Sala 2", 11, 0, 22, 9], ["Sala 3", 22, 0, 33, 9], ["Sala 4", 33, 0, 44, 9],
        ["Corredor", 0, 9, 44, 13], ["Biblioteca", 0, 13, 22, 22], ["Sala 5", 22, 13, 33, 22], ["Sala 6", 33, 13, 44, 22]],
      phones: [[8, 11], [22, 11], [36, 11]],
    },
    sinagoga: {
      name: { pt: "Sinagoga / instituição", en: "Synagogue / institution" },
      outline: [[10, 0], [36, 0], [36, 24], [10, 24], [10, 16], [0, 16], [0, 8], [10, 8]],
      walls: [
        [10, 0, 36, 0, "masonry"], [36, 0, 36, 24, "masonry"], [10, 24, 36, 24, "masonry"], [10, 24, 10, 16, "masonry"],
        [10, 16, 0, 16, "masonry"], [0, 16, 0, 13, "masonry"], [0, 11, 0, 8, "glass"], [0, 8, 10, 8, "masonry"],
        [10, 8, 10, 0, "masonry"],
        [10, 8, 10, 11, "block"], [10, 13, 10, 16, "block"],
        [30, 0, 30, 5, "drywall"], [30, 6.5, 30, 17, "drywall"], [30, 18.5, 30, 24, "drywall"], [30, 12, 36, 12, "drywall"]],
      rooms: [["Recepção", 0, 8, 10, 16], ["Santuário", 10, 0, 30, 24], ["Escritório", 30, 0, 36, 12],
        ["Sala de aula", 30, 12, 36, 24]],
      phones: [[5, 12], [20, 12], [33, 6]],
    },
    publico: {
      name: { pt: "Prédio público · recepção e corredores", en: "Public building · lobby and corridors" },
      outline: [[0, 0], [40, 0], [40, 30], [0, 30]],
      walls: [
        [0, 0, 40, 0, "concrete"], [40, 0, 40, 30, "concrete"], [0, 30, 17, 30, "concrete"], [23, 30, 40, 30, "concrete"],
        [0, 0, 0, 30, "concrete"],
        [0, 18, 17, 18, "block"], [23, 18, 40, 18, "block"], [17, 18, 17, 24, "glass"], [23, 18, 23, 24, "glass"],
        [17, 26, 17, 30, "glass"], [23, 26, 23, 30, "glass"],
        [0, 9, 8, 9, "drywall"], [9.2, 9, 18, 9, "drywall"], [19.2, 9, 30, 9, "drywall"], [31.2, 9, 40, 9, "drywall"],
        [13, 0, 13, 9, "drywall"], [26, 0, 26, 9, "drywall"],
        [12, 9, 12, 18, "block"], [28, 9, 28, 18, "block"]],
      rooms: [["Gabinete 1", 0, 0, 13, 9], ["Gabinete 2", 13, 0, 26, 9], ["Gabinete 3", 26, 0, 40, 9],
        ["Corredor", 0, 9, 40, 18], ["Atendimento", 0, 18, 17, 30], ["Recepção", 17, 18, 23, 30], ["Arquivo", 23, 18, 40, 30]],
      phones: [[20, 25], [6, 13], [34, 13]],
    },
  };
  if (typeof module !== "undefined") module.exports = LAYOUTS; else root.OzniLayouts = LAYOUTS;
})(this);
