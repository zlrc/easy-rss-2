interface Option {
  selector: string;
  attribute?: string;
}

type Key = "id" | "title" | "link" | "date" | "icon" | "author";

const attributes: { [x: string]: Option[] } = {
	author: [{ selector: "author name" }, { selector: "author" }],
	date: [
		{ selector: "published" },
		{ selector: "updated" },
		{ selector: "pubDate" }
	],
	id: [{ selector: "id" }, { selector: "guid" }],
	link: [{ selector: "link", attribute: "href" }, { selector: "link" }],
	title: [{ selector: "title" }]
};

const domainRegex = /[/?#]/;

function parse(el: Element, feed: Feed) {
	const entry: Entry = {
		id: "",
		title: "",
		link: "",
		date: "",
		icon: "",
		author: "",
	};

	for (const attribute in attributes) {
		const options = attributes[attribute];
		for (const option of options) {
			if (entry[attribute as Key]) continue;
			const element = el.querySelector(option.selector);
			if (element) {
				if (option.attribute)
					entry[attribute as Key] = element.getAttribute(option.attribute)!;
				else entry[attribute as Key] = element.textContent!;
			}
		}
	}

	// Get icon
	let domain = feed.url;
	if (feed.url.startsWith("http://")) domain = domain.slice(7);
	if (feed.url.startsWith("https://")) domain = domain.slice(8);
	entry.icon =
    "http://www.google.com/s2/favicons?domain=" + domain.split(domainRegex)[0];

	// Get thumbnail
	const thumbnail = el.getElementsByTagName("media:thumbnail")[0];
	if (thumbnail) entry.thumbnail = thumbnail.getAttribute("url")!;

	return entry as Entry;
}

function escapeAttributeValues(s : string): string {
	const re = /="([^"]*(?:[&'<>]|\\\").*?)(?<!\\)"/g; // captures unescaped attribute values e.g. <category label="d&d"/>
	return s.replace(re, function (_match : string, group1 : string) {
		const replacement = group1 // first capture group (everything that's between the quotation marks, only)
			.replace(/&(?![^\s]+;)/g, "&amp;") // regex matches any ampersand that *isn't* part of an escaped character.
			.replace("\"", "&quot;")
			.replace("'", "&apos;")
			.replace("<", "&lt;")
			.replace(">", "&gt;");
		return `="${replacement}"`;
	});
}

const parser = new DOMParser();

async function fetchEntries(feed: Feed): Promise<Entry[]> {
	try {
		const res = await fetch(feed.url);
		
		// Check for a valid response code
		if (!res.ok)
			throw Error(`Fetch returned with status code ${res.status}`);

		// Attempt to parse XML as-is.
		const src = await res.text();
		let xml = parser.parseFromString(src, "application/xml");

		// Check for any errors in parsing the XML
		let errorNode = xml.querySelector("parsererror");
		if (errorNode) {
			// Attempt to escape any characters if errors were found.
			xml = parser.parseFromString(escapeAttributeValues(src), "application/xml");
			errorNode = xml.querySelector("parsererror");
			if (errorNode)
				throw errorNode.innerHTML;
			console.warn(`Feed "${feed.name}" contains unescaped XML, but an automatic fix has been successfully applied.\nURL: ${feed.url}`);
		}
		
		const entries: Entry[] = [];
		for (const el of xml.querySelectorAll("entry, item"))
			entries.push(parse(el, feed));
		return entries;
	} catch (e) {
		console.log(`Failed to retrieve or process feed from "${feed.url}".\nFailed with error "${e}"`);
		return [];
	}
}

export { fetchEntries };
