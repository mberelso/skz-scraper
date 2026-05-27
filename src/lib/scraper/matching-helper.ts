export function normalizeNameForMatching(name: string): string {
    return name
        .toLowerCase()
        .replace(/\b(gmbh & co\.?\s*kg|gmbh & co\.?\s*ohg|gmbh|co\.?\s*kg|ag|eg|ug|se)\b/gi, '')
        .replace(/[^a-z0-9äöüß]/gi, '')
        .trim();
}
