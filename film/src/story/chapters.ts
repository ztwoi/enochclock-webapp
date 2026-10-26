// The story (the primer): the Sun film's chapters, each taught only in the words of scripture. Every chapter is a stretch
// of the film (frames from timeline.ts, so the two cannot drift) with a poster frame, a title taken from its own
// passage, and fuller passages than the film has room for. 1 Enoch: Charles 1912; the Bible: KJV.
import { D0, DS, E0, OFF, VISION_END } from '../sun/timeline.ts';

interface Passage { ref: string; text: string }
export interface Chapter { id: string; title: string; from: number; to: number; poster: number; passages: Passage[] }

export const SOURCES = '1 Enoch: R. H. Charles, The Book of Enoch (Oxford, 1912). The Bible: King James Version.';

export const CHAPTERS: Chapter[] = [
  { id: 'uriel', title: 'Which Uriel, the holy angel, showed me', from: 0, to: OFF, poster: 300, passages: [
    { ref: '1 Enoch 72:1', text: 'The Book of the courses of the luminaries of the heaven, the relations of each, according to their classes, their dominion and their seasons, according to their names and places of origin, and according to their months, which Uriel, the holy angel, who was with me, who is their guide, showed me; and he showed me all their laws exactly as they are, and how it is with regard to all the years of the world and unto eternity, till the new creation is accomplished which dureth till eternity.' },
    { ref: '1 Enoch 74:2', text: 'And all these Uriel, the holy angel who is the leader of them all, showed to me, and their positions, and I wrote down their positions as he showed them to me…' },
  ] },
  { id: 'first-law', title: 'The first law of the luminaries', from: OFF, to: D0, poster: OFF + 460, passages: [
    { ref: '1 Enoch 72:2–3', text: 'And this is the first law of the luminaries: the luminary the Sun has its rising in the eastern portals of the heaven, and its setting in the western portals of the heaven. And I saw six portals in which the sun rises, and six portals in which the sun sets: and the moon rises and sets in these portals, and the leaders of the stars and those whom they lead: six in the east and six in the west, and all following each other in accurately corresponding order: also many windows to the right and left of these portals.' },
    { ref: '1 Enoch 72:4–5', text: 'And first there goes forth the great luminary, named the Sun, and his circumference is like the circumference of the heaven, and he is quite filled with illuminating and heating fire. The chariot on which he ascends, the wind drives, and the sun goes down from the heaven and returns through the north in order to reach the east, and is so guided that he comes to the appropriate portal and shines in the face of the heaven.' },
    { ref: '1 Enoch 72:37', text: 'As he rises, so he sets and decreases not, and rests not, but runs day and night, and his light is sevenfold brighter than that of the moon; but as regards size they are both equal.' },
  ] },
  { id: 'parts', title: 'The day amounts exactly to ten parts and the night to eight parts', from: D0 + DS.parts[0], to: D0 + DS.parts[1], poster: D0 + 440, passages: [
    { ref: '1 Enoch 72:9–10', text: 'And during this period the day becomes daily longer and the night nightly shorter to the thirtieth morning. On that day the day is longer than the night by a ninth part, and the day amounts exactly to ten parts and the night to eight parts.' },
    { ref: '1 Enoch 72:13–14', text: 'And it returns to the east and enters into the sixth portal, and rises and sets in the sixth portal one and thirty mornings on account of its sign. On that day the day becomes longer than the night, and the day becomes double the night, and the day becomes twelve parts, and the night is shortened and becomes six parts.' },
  ] },
  { id: 'light', title: 'The length of the day and of the night', from: D0 + DS.light[0], to: D0 + DS.light[1], poster: D0 + DS.light[0] + 400, passages: [
    { ref: '1 Enoch 72:15–16', text: 'And the sun mounts up to make the day shorter and the night longer, and the sun returns to the east and enters into the sixth portal, and rises from it and sets thirty mornings. And when thirty mornings are accomplished, the day decreases by exactly one part, and becomes eleven parts, and the night seven.' },
    { ref: '1 Enoch 72:19–20', text: 'And the sun goes forth from that fifth portal and sets in the fifth portal of the west, and rises in the fourth portal for one and thirty mornings on account of its sign, and sets in the west. On that day the day is equalised with the night, [and becomes of equal length], and the night amounts to nine parts and the day to nine parts.' },
    { ref: '1 Enoch 72:25–26', text: 'And the sun rises on that day from that second portal and sets in the west in the second portal, and returns to the east into the first portal for one and thirty mornings, and sets in the first portal in the west of the heaven. And on that day the night becomes longer and amounts to the double of the day: and the night amounts exactly to twelve parts and the day to six.' },
    { ref: '1 Enoch 72:33–34', text: 'And the length of the day and of the night, and the shortness of the day and of the night arise—through the course of the sun these distinctions are made. So it comes that its course becomes daily longer, and its course nightly shorter.' },
  ] },
  { id: 'leaders', title: 'The leaders of the stars and those whom they lead', from: D0 + DS.grid[0], to: D0 + DS.grid[1], poster: D0 + DS.grid[0] + 200, passages: [
    { ref: '1 Enoch 33:3', text: 'And I saw how the stars of heaven come forth, and I counted the portals out of which they proceed, and wrote down all their outlets, of each individual star by itself, according to their number and their names, their courses and their positions, and their times and their months, as Uriel the holy angel who was with me showed me.' },
    { ref: '1 Enoch 36:2–3', text: '…from thence I went to the east to the ends of the heaven, and saw here the three eastern portals of heaven open and small portals above them. Through each of these small portals pass the stars of heaven and run their course to the west on the path which is shown to them.' },
  ] },
  { id: 'months', title: 'One and thirty mornings on account of its sign', from: D0 + DS.months[0], to: D0 + DS.months[1], poster: D0 + DS.months[0] + 250, passages: [
    { ref: '1 Enoch 72:6', text: 'In this way he rises in the first month in the great portal, which is the fourth [those six portals in the east].' },
    { ref: '1 Enoch 72:8', text: 'When the sun rises in the heaven, he comes forth through that fourth portal thirty mornings in succession, and sets accurately in the fourth portal in the west of the heaven.' },
    { ref: '1 Enoch 72:11', text: 'And the sun rises from that fourth portal, and sets in the fourth and returns to the fifth portal of the east thirty mornings, and rises from it and sets in the fifth portal.' },
    { ref: '1 Enoch 72:13', text: 'And it returns to the east and enters into the sixth portal, and rises and sets in the sixth portal one and thirty mornings on account of its sign.' },
    { ref: '1 Enoch 72:17', text: 'And the sun goes forth from that sixth portal in the west, and goes to the east and rises in the fifth portal for thirty mornings, and sets in the west again in the fifth western portal.' },
    { ref: '1 Enoch 72:21', text: 'And the sun rises from that portal and sets in the west, and returns to the east and rises thirty mornings in the third portal and sets in the west in the third portal.' },
  ] },
  { id: 'seasons', title: 'The four which divide the four portions of the year', from: D0 + DS.seasons[0], to: D0 + DS.seasons[1], poster: D0 + DS.seasons[0] + 720, passages: [
    { ref: '1 Enoch 82:4–6', text: 'Blessed are all the righteous, blessed are all those who walk in the way of righteousness and sin not as the sinners, in the reckoning of all their days in which the sun traverses the heaven, entering into and departing from the portals for thirty days with the heads of thousands of the order of the stars, together with the four which are intercalated which divide the four portions of the year, which lead them and enter with them four days. Owing to them men shall be at fault and not reckon them in the whole reckoning of the year: yea, men shall be at fault, and not recognize them accurately. For they belong to the reckoning of the year and are truly recorded (thereon) for ever, one in the first portal and one in the third, and one in the fourth and one in the sixth, and the year is completed in three hundred and sixty-four days.' },
  ] },
  { id: 'sabbath', title: 'God blessed the seventh day', from: D0 + DS.priests[0], to: D0 + DS.priests[0] + 300, poster: D0 + DS.priests[0] + 120, passages: [
    { ref: 'Genesis 2:2–3', text: 'And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made. And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.' },
  ] },
  { id: 'courses', title: 'The orderings of them in their service', from: D0 + DS.priests[0] + 300, to: D0 + DS.priests[1], poster: D0 + DS.priests[0] + 1000, passages: [
    { ref: '1 Chronicles 24:7–18', text: 'Now the first lot came forth to Jehoiarib, the second to Jedaiah, the third to Harim, the fourth to Seorim, the fifth to Malchijah, the sixth to Mijamin, the seventh to Hakkoz, the eighth to Abijah, the ninth to Jeshua, the tenth to Shecaniah, the eleventh to Eliashib, the twelfth to Jakim, the thirteenth to Huppah, the fourteenth to Jeshebeab, the fifteenth to Bilgah, the sixteenth to Immer, the seventeenth to Hezir, the eighteenth to Aphses, the nineteenth to Pethahiah, the twentieth to Jehezekel, the one and twentieth to Jachin, the two and twentieth to Gamul, the three and twentieth to Delaiah, the four and twentieth to Maaziah.' },
    { ref: '1 Chronicles 24:19', text: 'These were the orderings of them in their service to come into the house of the LORD, according to their manner, under Aaron their father, as the LORD God of Israel had commanded him.' },
  ] },
  { id: 'year', title: 'The year is completed in three hundred and sixty-four days', from: D0 + DS.year[0], to: E0, poster: D0 + DS.year[0] + 200, passages: [
    { ref: '1 Enoch 72:32', text: 'On that day the night decreases and amounts to nine parts, and the day to nine parts, and the night is equal to the day and the year is exactly as to its days three hundred and sixty-four.' },
    { ref: '1 Enoch 74:12', text: 'And the sun and the stars bring in all the years exactly, so that they do not advance or delay their position by a single day unto eternity; but complete the years with perfect justice in 364 days.' },
    { ref: '1 Enoch 72:35', text: 'And this is the law and the course of the sun, and his return as often as he returns sixty times and rises, i.e. the great luminary which is named the Sun, for ever and ever.' },
  ] },
  { id: 'windows', title: 'Twelve window-openings', from: E0, to: VISION_END, poster: E0 + 260, passages: [
    { ref: '1 Enoch 72:7', text: 'And in that fourth portal from which the sun rises in the first month are twelve window-openings, from which proceed a flame when they are opened in their season.' },
  ] },
];
