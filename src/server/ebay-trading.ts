import "server-only";
import type { CountryCode } from "@/lib/settings";
import { MARKETS } from "./ebay";
import { PublicError } from "./http";

/**
 * Client eBay Trading API (XML, ancienne génération) : c'est la SEULE voie de messagerie acheteur atteignable
 * avec les scopes OAuth actuels. La REST « Commerce Message API » existe mais renvoie 403 (accès restreint,
 * réservé à certains partenaires) — vérifié en conditions réelles le 22/09/2026.
 */

const ENDPOINT = "https://api.ebay.com/ws/api.dll";
const COMPAT_LEVEL = "1177";

export class TradingApiError extends PublicError {
  constructor(message: string) {
    super(message, 502);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function tradingCall(token: string, market: CountryCode, callName: string, bodyXml: string): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": COMPAT_LEVEL,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": MARKETS[market].tree,
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: bodyXml,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new TradingApiError(`Trading API ${callName} : HTTP ${res.status}`);
  return text;
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m?.[1];
}

function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export type BuyerQuestion = { messageId: string; itemId: string; itemTitle: string; buyer: string; question: string };

/**
 * Questions acheteur non répondues, tous articles confondus (y compris l'activité eBay personnelle du vendeur,
 * hors DropFlow). Le tri par annonce DropFlow (ItemID connu) se fait à l'appelant : ne JAMAIS répondre à un
 * message qui ne concerne pas une annonce créée par DropFlow.
 */
export async function unansweredBuyerMessages(token: string, market: CountryCode): Promise<BuyerQuestion[]> {
  const xml = await tradingCall(
    token,
    market,
    "GetMemberMessages",
    `<?xml version="1.0" encoding="utf-8"?>
<GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <MailMessageType>All</MailMessageType>
  <MessageStatus>Unanswered</MessageStatus>
  <DetailLevel>ReturnMessages</DetailLevel>
</GetMemberMessagesRequest>`,
  );
  if (!/<Ack>Success<\/Ack>/.test(xml) && !/<Ack>Warning<\/Ack>/.test(xml)) {
    if (/<ShortMessage>.*aucune.*<\/ShortMessage>/i.test(xml)) return [];
    throw new TradingApiError(`GetMemberMessages : ${tag(xml, "LongMessage") ?? "échec"}`);
  }
  const out: BuyerQuestion[] = [];
  for (const ex of blocks(xml, "MemberMessageExchange")) {
    const itemId = tag(ex, "ItemID");
    const messageId = tag(ex, "MessageID");
    const buyer = tag(ex, "SenderID");
    const bodyRaw = tag(ex, "Body");
    if (!itemId || !messageId || !buyer || !bodyRaw) continue; // pas d'annonce liée (message personnel eBay) : ignoré
    out.push({ messageId, itemId, itemTitle: unescapeXml(tag(ex, "Title") ?? ""), buyer, question: unescapeXml(bodyRaw) });
  }
  return out;
}

/** Répond à une question acheteur liée à une annonce. Le destinataire est TOUJOURS l'auteur de la question d'origine. */
export async function replyToBuyer(token: string, market: CountryCode, q: { itemId: string; buyer: string }, body: string): Promise<void> {
  const xml = await tradingCall(
    token,
    market,
    "AddMemberMessageAAQToPartner",
    `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${esc(q.itemId)}</ItemID>
  <MemberMessage>
    <QuestionType>General</QuestionType>
    <RecipientID>${esc(q.buyer)}</RecipientID>
    <Subject>Réponse à votre question</Subject>
    <Body>${esc(body)}</Body>
  </MemberMessage>
</AddMemberMessageAAQToPartnerRequest>`,
  );
  if (!/<Ack>Success<\/Ack>/.test(xml) && !/<Ack>Warning<\/Ack>/.test(xml)) {
    throw new TradingApiError(`Envoi impossible : ${tag(xml, "LongMessage") ?? "échec"}`);
  }
}
