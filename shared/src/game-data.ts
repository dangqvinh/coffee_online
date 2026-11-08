import type { CustomerState, Ingredient } from "./protocol";

export const INGREDIENTS: Ingredient[] = [
  { id: "ca-phe", name: "Cà phê", kind: "base", taste: { sweet: 0, bitter: 8, creamy: 0, sour: 0, cool: 0, fragrant: 5, quirky: 0, caffeine: 8 }, cost: 2 },
  { id: "tra", name: "Trà sen", kind: "base", taste: { sweet: 1, bitter: 2, creamy: 0, sour: 0, cool: 0, fragrant: 8, quirky: 1, caffeine: 4 }, cost: 2 },
  { id: "sua-tuoi", name: "Sữa tươi", kind: "flavor", taste: { sweet: 3, bitter: 0, creamy: 8, sour: 0, cool: 0, fragrant: 1, quirky: 0, caffeine: 0 }, cost: 2 },
  { id: "chanh", name: "Chanh", kind: "flavor", taste: { sweet: 0, bitter: 0, creamy: 0, sour: 8, cool: 2, fragrant: 3, quirky: 2, caffeine: 0 }, cost: 1 },
  { id: "siro-dau", name: "Siro dâu", kind: "flavor", taste: { sweet: 8, bitter: 0, creamy: 0, sour: 2, cool: 0, fragrant: 4, quirky: 3, caffeine: 0 }, cost: 2 },
  { id: "da", name: "Đá viên", kind: "temperature", taste: { sweet: 0, bitter: 0, creamy: 0, sour: 0, cool: 9, fragrant: 0, quirky: 0, caffeine: 0 }, cost: 1 },
  { id: "kem-muoi", name: "Kem muối", kind: "topping", taste: { sweet: 4, bitter: 0, creamy: 7, sour: 0, cool: 0, fragrant: 1, quirky: 5, caffeine: 0 }, cost: 3 },
  { id: "tran-chau", name: "Trân châu", kind: "topping", taste: { sweet: 5, bitter: 0, creamy: 1, sour: 0, cool: 0, fragrant: 0, quirky: 8, caffeine: 0 }, cost: 3 },
];

export function scoreDrink(selectedIds: string[], customer: CustomerState | undefined): { score: number; coins: number } {
  const total = { sweet: 0, bitter: 0, creamy: 0, sour: 0, cool: 0, fragrant: 0, quirky: 0, caffeine: 0 };
  for (const id of selectedIds) {
    const ingredient = INGREDIENTS.find((item) => item.id === id);
    if (!ingredient) continue;
    for (const axis of Object.keys(total) as (keyof typeof total)[]) total[axis] += ingredient.taste[axis];
  }
  const target = customer?.mood === "trầm tư" ? total.fragrant + total.creamy : customer?.mood === "tò mò" ? total.quirky + total.sour : total.sweet + total.cool;
  const score = Math.max(0, Math.min(100, Math.round(target * 3 + total.bitter)));
  return { score, coins: Math.max(1, Math.round(score / 20)) };
}
