type DeepLResponse = {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
};

export async function translateWithDeepL(
  text: string,
  isHtml = false,
): Promise<string> {
  if (!text.trim()) return "";

  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPL_API_KEY belum dikonfigurasi");
  }

  const baseUrl = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";

  const response = await fetch(`${baseUrl}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: "ID",
      target_lang: "EN-US",
      ...(isHtml && { tag_handling: "html" }),
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`DeepL translation failed: ${response.status}`);
  }

  const result = (await response.json()) as DeepLResponse;
  const translated = result.translations?.[0]?.text;

  if (!translated) {
    throw new Error("DeepL mengembalikan hasil kosong");
  }

  return translated;
}
