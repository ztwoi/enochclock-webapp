// The verses of the Sun film as timed cues (frames at 30 per second, from the film's start). The film is rendered
// clean for the app, which lays these over it as live text sized to the screen (src/film.ts); the same cues are
// burned in for the version made to be shared. One list, computed from the film's own timeline: they cannot drift.
import { D0, DS, E0, MT, OFF, PB, PT, SA } from './timeline.ts';

export interface Cue { from: number; to: number; text: string; ref: string; geez: string }
/** Each cue fades in over this many frames at its start and out over the same at its end. */
export const CUE_FADE = 18;

export const CUES: Cue[] = [
  { from: OFF + 40, to: OFF + 210, ref: "1 Enoch 72:2", text: `And this is the first law of the luminaries: the luminary the Sun has its rising in the eastern portals of the heaven, and its setting in the western portals of the heaven.`, geez: `ወዝንቱ ውእቱ ትእዛዝ ቀዳማዊ ዘብርሃናት ፀሐይ ብርሃን ሙፃኡ በኀዋኅወ ሰማይ እለ መንገለ ጽባሕ ወምዕራቢሁ በኀዋኅወ ሰማይ ዘምዕራብ` },
  { from: OFF + 225, to: OFF + 420, ref: "1 Enoch 72:5", text: `…and the sun goes down from the heaven and returns through the north in order to reach the east, and is so guided that he comes to the appropriate portal and shines in the face of the heaven.`, geez: `ወየዐርብ ፀሐይ እምሰማይ ወይገብእ እንተ መስዕ ከመ ይሑር ምሥራቀ ወይትመራሕ ከመ ይባእ ኀበ ዝኩ ኆኅት ወያበርህ በገጸ ሰማይ` },
  { from: OFF + 435, to: OFF + MT.end + 30, ref: "1 Enoch 72:3", text: `…and the moon rises and sets in these portals, and the leaders of the stars and those whom they lead…`, geez: `ወወርኅ በውእቶን ኀዋኅው ይሠርቅ ወየዐርብ ወመራሒሆሙ ለከዋክብት ምስለ እለ ይመርሕዎሙ` },
  { from: 340, to: 478, ref: "1 Enoch 74:2", text: `And all these Uriel, the holy angel who is the leader of them all, showed to me…`, geez: `ወኵሎ አርአየኒ ኡርኤል መልአክ ቅዱስ ዘውእቱ መራኂሆሙ ለኵሎሙ` },
  { from: D0 + 40, to: D0 + PT.toPeak[0] - 20, ref: "1 Enoch 72:10", text: `…the day is longer than the night by a ninth part, and the day amounts exactly to ten parts and the night to eight parts.`, geez: `` },
  { from: D0 + PT.toPeak[0] - 10, to: D0 + DS.parts[1] + 50, ref: "1 Enoch 72:14", text: `On that day the day becomes longer than the night, and the day becomes double the night, and the day becomes twelve parts, and the night is shortened and becomes six parts.`, geez: `ወበይእቲ ዕለት ትነውኅ ዕለት እምሌሊት ወትከውን ዕለት ካዕበተ ሌሊት ወትከውን ዕለት ፲ ወ ፪ ክፍለ` },
  { from: D0 + DS.light[0] + 60, to: D0 + DS.light[1] - 10, ref: "1 Enoch 72:15", text: `And the sun mounts up to make the day shorter and the night longer… and when thirty mornings are accomplished, the day decreases by exactly one part.`, geez: `` },
  { from: D0 + DS.grid[0] + 60, to: D0 + DS.grid[1] - 5, ref: "1 Enoch 72:3", text: `…and the moon rises and sets in these portals, and the leaders of the stars and those whom they lead…`, geez: `ወወርኅ በውእቶን ኀዋኅው ይሠርቅ ወየዐርብ ወመራሒሆሙ ለከዋክብት ምስለ እለ ይመርሕዎሙ` },
  { from: D0 + DS.months[0] + 40, to: D0 + DS.months[1] - 5, ref: "1 Enoch 72:13", text: `And it returns to the east and enters into the sixth portal, and rises and sets in the sixth portal one and thirty mornings on account of its sign.`, geez: `ወይገብእ ፀሐይ ለጽባሕ ወይበውእ ውስተ ሳድስት ኆኅት ወይወፅእ ወየዐርብ በሳድስት ኆኅት ፴ ወ ፩ ጽባሐ በእንተ ትእምርተ ዚአሃ` },
  { from: D0 + DS.year[0] + 20, to: D0 + DS.year[0] + 150, ref: "1 Enoch 82:6", text: `…one in the first portal and one in the third, and one in the fourth and one in the sixth…`, geez: `፩ በቀዳሚት ኆኅት ወ ፩ በሣልሲት ወ ፩ በራብዕት ወ ፩ በሳድስት` },
  { from: D0 + DS.year[0] + 155, to: D0 + DS.year[1] + 30, ref: "1 Enoch 72:32", text: `…and the night is equal to the day and the year is exactly as to its days three hundred and sixty-four.`, geez: `ወይትዔረይ ሌሊት ምስለ መዓልት ወይከውን ዓመት ጥንቁቀ መዋዕለ ፫፻ ወ ፷ ወረብዐ` },
  { from: E0 + 160, to: E0 + 360, ref: "1 Enoch 72:7", text: `And in that fourth portal from which the sun rises in the first month are twelve window-openings, from which proceed a flame when they are opened in their season.`, geez: `` },
  { from: D0 + DS.seasons[0] + SA.lay[0] + 20, to: D0 + DS.seasons[0] + SA.lay[1], ref: "1 Enoch 72:8", text: `When the sun rises in the heaven, he comes forth through that fourth portal thirty mornings in succession, and sets accurately in the fourth portal in the west of the heaven.`, geez: `` },
  { from: D0 + DS.seasons[0] + SA.turns[0] + 10, to: D0 + DS.seasons[0] + SA.turns[1], ref: "1 Enoch 72:19", text: `…and rises in the fourth portal for one and thirty mornings on account of its sign, and sets in the west.`, geez: `` },
  { from: D0 + DS.seasons[0] + SA.split[0] + 10, to: D0 + DS.seasons[0] + SA.gather[0] + 40, ref: "1 Enoch 82:4", text: `…entering into and departing from the portals for thirty days… together with the four which are intercalated which divide the four portions of the year…`, geez: `` },
  { from: D0 + DS.priests[0] + 30, to: D0 + DS.priests[0] + 200, ref: "Genesis 2:3", text: `And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.`, geez: `` },
  { from: D0 + DS.priests[0] + 300, to: D0 + DS.priests[0] + PB.year[0] + 20, ref: "1 Chronicles 24:19", text: `These were the orderings of them in their service to come into the house of the LORD, according to their manner, under Aaron their father, as the LORD God of Israel had commanded him.`, geez: `` },
  { from: 250, to: 335, ref: "1 Enoch 72:1", text: `…which Uriel, the holy angel, who was with me, who is their guide, showed me`, geez: `እለ አርአየኒ ኡርኤል መልአክ ቅዱስ ዘሀሎ ምስሌየ ዘውእቱ መራሒሆሙ` },
].sort((a, b) => a.from - b.from);
