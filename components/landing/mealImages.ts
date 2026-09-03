/**
 * Image pool for the landing-page dome gallery.
 *
 * Source: Unsplash. The Unsplash Licence permits commercial use with no
 * attribution required — https://unsplash.com/license. Served straight from
 * images.unsplash.com (their CDN handles resize/format via the query string),
 * so nothing is checked into `public/`.
 *
 * Every URL below was verified to return HTTP 200 on 2026-08-20.
 *
 * ⚠️ ALT TEXT IS APPROXIMATE. These were collected from Unsplash search
 * results by keyword; the individual photos have not been viewed. Before this
 * page ships publicly someone must eyeball all 45 and:
 *   - fix any alt text that misdescribes its image (it is read aloud by
 *     screen readers, and wrong alt text is worse than none),
 *   - drop any frame showing an identifiable person in distress. The dome is
 *     meant to read as hope and community, not hardship — and pApAmA's own
 *     schema stores beneficiaries as hashes precisely to avoid exposing them.
 */

export interface MealImage {
    src: string;
    alt: string;
}

const CDN = "https://images.unsplash.com";

/**
 * Default CDN width. The sphere repeats 45 photos across 175 tiles, so the
 * browser only ever fetches 45 files — but on a phone those tiles render at
 * roughly 34px, and shipping 640px JPEGs for them is most of the cost of
 * putting the dome on mobile at all. Callers pass a smaller width there.
 */
const DEFAULT_W = 640;

const params = (w: number) => `q=80&w=${w}&h=${w}&auto=format&fit=crop`;

/** id + alt only; the URL is built per width by mealImages(). */
type Entry = readonly [id: string, alt: string];

const img = (id: string, alt: string): Entry => [id, alt] as const;

/** Cooked meals and thalis — the thing a token actually buys. */
const MEALS: Entry[] = [
    img("photo-1680993032090-1ef7ea9b51e5", "A South Indian thali served on a steel plate"),
    img("photo-1742281257687-092746ad6021", "A home-style vegetarian meal with rice and curries"),
    img("photo-1711153419402-336ee48f2138", "A plated Indian meal with several small side dishes"),
    img("photo-1546833999-b9f581a1996d", "A traditional thali with rice, dal and vegetables"),
    img("photo-1589778655375-3e622a9fc91c", "A full meal tray with breads and curries"),
    img("photo-1742281258189-3b933879867a", "Rice and curry served in small bowls"),
    img("photo-1559561724-732dbca7be1e", "An Indian meal laid out on a banana leaf"),
    img("photo-1542367592-8849eb950fd8", "A thali of assorted vegetarian dishes"),
    img("photo-1742281257707-0c7f7e5ca9c6", "A simple plate of rice with accompaniments"),
    img("photo-1567337710282-00832b415979", "A vegetarian platter with breads and dips"),
    img("photo-1588644525273-f37b60d78512", "Freshly cooked Indian food arranged on a plate"),
    img("photo-1727404679933-99daa2a7573a", "A hot meal served in a steel tiffin plate"),
    img("photo-1680359873864-43e89bf248ac", "An assortment of home-cooked Indian dishes"),
    img("photo-1756741987051-a6a38f28838b", "A prepared meal ready to be served"),
    img("photo-1723388800779-5699cc142f18", "A traditional plate of Indian food"),
];

/** Kitchens, cooking at scale, shared tables. */
const KITCHENS: Entry[] = [
    img("photo-1752760023161-c2b5d8edd1a3", "A community kitchen preparing food"),
    img("photo-1700501976004-0b891f9cc395", "Cooking pots in a large shared kitchen"),
    img("photo-1626010448923-5195f144def2", "Food being prepared in bulk"),
    img("photo-1763570645098-371723617ee9", "A kitchen workspace during meal preparation"),
    img("photo-1723202594801-bae926165ef9", "Hands preparing ingredients in a kitchen"),
    img("photo-1761300463257-7a6b70d43c27", "A communal cooking area"),
    img("photo-1569435998017-abb5d562dedf", "Food being cooked in large vessels"),
    img("photo-1595478580454-fd193b0e503e", "A shared meal laid out on a table"),
    img("photo-1760907949894-b66d728e0a8e", "Meal preparation in a community setting"),
    img("photo-1772724318003-16a9b0b848ef", "A kitchen counter with prepared food"),
    img("photo-1764001032216-360a43576788", "Cooking in progress in a community kitchen"),
    img("photo-1758522488003-f48d8b40ea82", "Ingredients laid out before cooking"),
    img("photo-1777427676365-d84b81691767", "A group meal being prepared"),
    img("photo-1772724317667-afe2d40f6158", "Food service in a shared kitchen"),
    img("photo-1772724317488-b901d235d419", "A community kitchen at work"),
];

/** People doing the giving — volunteers, serving, handing over. */
const VOLUNTEERS: Entry[] = [
    img("photo-1710092784814-4a6f158913b8", "A volunteer serving food"),
    img("photo-1660015154403-0fd84e5d810d", "Volunteers distributing meals"),
    img("photo-1775403834287-f667f0d1677e", "A meal being handed to someone"),
    img("photo-1736240843906-f9e8b782112e", "Volunteers packing food parcels"),
    img("photo-1772724317603-f6fae52cffff", "A volunteer at a food distribution point"),
    img("photo-1629765090415-03f6a9a8f508", "Food being served to a queue"),
    img("photo-1774025967891-b4ed833e57ac", "Volunteers working together to serve meals"),
    img("photo-1677128912094-36d988ce198b", "A helping hand offering food"),
    img("photo-1732194438313-40cb4261f49b", "Meals being distributed in a community"),
    img("photo-1660675133530-05d912b16cb1", "A volunteer preparing food parcels"),
    img("photo-1785061383535-6dc565a80934", "People serving food together"),
    img("photo-1581645964124-bdfeada1b8c5", "Volunteers sorting donated food"),
    img("photo-1741622281869-d9b2feb01a21", "A food distribution in progress"),
    img("photo-1776144006544-9c3cd050e153", "Volunteers handing out meals"),
    img("photo-1561539623-f8091d2c2b20", "Community members sharing a meal"),
];

/**
 * Interleaved so the sphere never shows three plates of rice side by side —
 * DomeGallery repeats the pool to fill its tiles in order, so the order here
 * is the order you see around the equator.
 */
const INTERLEAVED: Entry[] = Array.from(
    { length: Math.max(MEALS.length, KITCHENS.length, VOLUNTEERS.length) },
    (_, i) => [MEALS[i], VOLUNTEERS[i], KITCHENS[i]]
)
    .flat()
    .filter((x): x is Entry => Boolean(x));

/** Build the pool at a given CDN width. */
export function mealImages(width: number = DEFAULT_W): MealImage[] {
    const p = params(width);
    return INTERLEAVED.map(([id, alt]) => ({ src: `${CDN}/${id}?${p}`, alt }));
}

/** Default-width pool, for callers that don't care. */
export const MEAL_IMAGES: MealImage[] = mealImages();
