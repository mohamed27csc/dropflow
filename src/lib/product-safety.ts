/**
 * Filtre « produits à risque » : évite ce qu'eBay interdit ou surveille de près, et donc ce qui peut faire suspendre ton compte vendeur.
 * Volontairement strict : mieux vaut ignorer un bon produit que risquer le compte. Liste à compléter selon ton expérience.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Marques protégées : les revendre sans autorisation = contrefaçon présumée (suppression d'annonces, suspension). */
const BRANDS = [
  "nike", "adidas", "puma", "gucci", "louis vuitton", "chanel", "dior", "prada", "hermes", "balenciaga", "versace", "burberry", "fendi", "rolex", "cartier", "supreme", "off-white", "yeezy", "jordan", "new balance", "under armour", "north face", "moncler", "lacoste", "ralph lauren", "tommy hilfiger", "calvin klein", "levi", "converse", "vans",
  "apple", "airpods", "iphone", "ipad", "macbook", "samsung", "galaxy", "huawei", "xiaomi", "sony", "playstation", "ps5", "xbox", "nintendo", "switch", "dyson", "bose", "jbl", "gopro", "dji", "garmin", "fitbit", "logitech",
  "disney", "marvel", "pokemon", "pikachu", "nintendo", "lego", "barbie", "hello kitty", "harry potter", "star wars", "minecraft", "sanrio", "mickey", "spiderman", "naruto", "one piece", "stitch", "frozen", "batman", "superman",
  "coca cola", "starbucks", "michelin",
];

/** Articles interdits ou restreints sur eBay, ou à risque de sécurité / douane / responsabilité. */
const RESTRICTED = [
  // armes et assimilés
  "knife", "couteau", "dagger", "sword", "epee", "pistol", "rifle", "airsoft", "bb gun", "airgun", "air gun", "pellet gun", "taser", "stun", "pepper spray", "spray defense", "brass knuckle", "crossbow", "arbalete", "slingshot", "handcuff", "ammo", "bullet",
  // tabac, drogue, alcool
  "vape", "e-cigarette", "cigarette", "cigar", "tobacco", "shisha", "hookah", "cbd", "cannabis", "weed", "grinder", "drug", "alcohol", "wine", "whisky", "vodka",
  // santé et médicaments : allégations interdites, responsabilité
  "supplement", "vitamin", "pill", "capsule", "slimming", "weight loss", "diet", "detox", "medical", "medicine", "drug", "syringe", "insulin", "blood pressure", "thermometer", "contact lens", "lentille", "hearing aid", "cure", "treatment", "therapy", "anti-aging", "whitening", "teeth whitening", "hair growth", "sunscreen", "cream", "creme", "serum", "essential oil", "perfume", "parfum",
  // dispositifs médicaux / stimulation électrique / actes dermatologiques : règlement eBay « dispositifs médicaux et équipements »
  // (déclenche un retrait d'annonce et un avertissement de compte, vérifié en conditions réelles le 22/09/2026)
  "ems", "tens unit", "microcurrent", "micro-needle", "microneedle", "micro needle", "mole removal", "muscle stimulator", "electric stimulation", "electrostimulation", "nebulizer", "oxygen concentrator", "pulse oximeter", "glucose meter", "acupuncture",
  // élargi le 22/09/2026 après un 2e retrait sur la même famille : IPL, photon/LED thérapeutique, massage électrique/ultrasonique du visage et des yeux
  "ipl device", "ipl beauty", "photon", "led mask", "face led", "led facial", "facial led", "led therapy", "eye massager", "facial massage device", "face massage device", "ultrasonic massage", "ultrasonic beauty",
  // écarté à la demande du vendeur
  "wig", "wigs", "perruque", "perruques", "hair weave", "tissage", "human hair", "lace front", "hair extension",
  // adulte
  "adult", "sex", "erotic", "lingerie sexy", "vibrator", "dildo", "bdsm", "fetish", "condom",
  // électrique / batteries / sécurité : rappels, normes CE, expédition « sensitive »
  "lithium", "power bank", "powerbank", "battery pack", "e-bike battery", "charger", "chargeur", "hoverboard", "drone", "laser pointer", "laser", "fireworks", "firework", "explosive", "lighter", "briquet", "flammable", "aerosol", "magnet", "aimant", "neodymium",
  // enfants et sécurité : normes strictes (jouets, puériculture)
  "baby monitor", "car seat", "siege auto", "pacifier", "tetine", "teether", "crib", "helmet", "casque moto",
  // animaux, plantes, contenu
  "ivory", "ivoire", "fur", "fourrure", "seeds", "graine", "live animal", "pet medication", "flea", "anti-puce",
  // contenu numérique / faux documents
  "fake id", "counterfeit", "replica", "copie", "imitation", "1:1", "high quality copy", "bootleg", "cracked", "software key", "gift card", "carte cadeau",
];

export type RiskCheck = { safe: true } | { safe: false; reason: string };

const has = (haystack: string, needle: string) => new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(haystack);

/** Vérifie le nom (et la description si fournie). */
export function checkProduct(name: string, description = ""): RiskCheck {
  const text = norm(`${name} ${description.slice(0, 1500)}`);
  for (const b of BRANDS) if (has(text, norm(b))) return { safe: false, reason: `Marque protégée (« ${b} »)` };
  for (const w of RESTRICTED) if (has(text, norm(w))) return { safe: false, reason: `Article restreint (« ${w} »)` };
  return { safe: true };
}
