/*
 * Shared genre list — demo track titles per genre (no bundled editorial text).
 * Hover preview: short MP3 clips in genre-clips/ (build with scripts/fetch-genre-clips.py + yt-dlp).
 * audioFallback: Kevin MacLeod (incompetech.com), CC BY 4.0 — used if the local clip is missing.
 */
window.SONG_SHARE_GENRES = [
  {
    name: "All genres",
    inspiredByArtists: "Community — every posted track",
    clipSlug: "all-genres",
    /* Hover: reuse neutral clip; “All genres” lists every publish, not a single style. */
    audio: "genre-clips/other.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Amazing%20Plan.mp3",
    tracks: [
      { title: "Everything posted", releaseYear: 2026 },
      { title: "Across every tag" },
      { title: "Newest first in the stack" },
    ],
  },
  {
    name: "Pop",
    inspiredByArtists: "Michael Jackson, Madonna, Taylor Swift, ABBA",
    clipSlug: "pop",
    /* Hover: sound_for_you-happy-indie-pop-energetic-upbeat-uplifting-catchy-indie-pop-487485 → genre-clips/pop.mp3 */
    audio: "genre-clips/pop.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Brightly%20Fancy.mp3",
    tracks: [
      { title: "Neon Heartbeat", releaseYear: 1986 },
      { title: "Radio Static Love", releaseYear: 1989 },
      { title: "Saturday Forever", releaseYear: 1999 },
      { title: "Silver Lining", releaseYear: 2007 },
      { title: "Echo Chamber", releaseYear: 2018 },
    ],
    /** Home board only: browse demo “albums” (subsets of tracks by index into `tracks`). */
    boardAlbums: [
      { title: "Neon Pulse EP", trackIndices: [0, 1] },
      { title: "Weekend Singles", trackIndices: [2, 3] },
      { title: "After Hours", trackIndices: [4] },
    ],
  },
  {
    name: "Hip-Hop",
    inspiredByArtists: "Drake, Kendrick Lamar, Tupac, The Notorious B.I.G.",
    clipSlug: "hip-hop",
    /* Hover: nesterouk-street-flow-207462 → genre-clips/hip-hop.mp3 */
    audio: "genre-clips/hip-hop.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Digya.mp3",
    tracks: [
      { title: "Block Party Ghost" },
      { title: "Midnight Cipher" },
      { title: "Subway Reverie" },
      { title: "Gold Chain Sunday" },
      { title: "Kick Drum Testament" },
    ],
  },
  {
    name: "Rap",
    inspiredByArtists: "J. Cole, Nas, Eminem, Lil Wayne",
    clipSlug: "rap",
    /* Hover: reuse hip-hop clip so Rap has immediate preview coverage. */
    audio: "genre-clips/hip-hop.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Digya.mp3",
    tracks: [
      { title: "Concrete Cadence" },
      { title: "Notebook Bars" },
      { title: "Siren Verse" },
      { title: "Red Light Freestyle" },
      { title: "Mic Check Mirage" },
    ],
  },
  {
    name: "Rock",
    inspiredByArtists: "Queen, Led Zeppelin, Nirvana",
    clipSlug: "rock",
    /* Hover: bundled clip at genre-clips/rock.mp3 (e.g. nastelbom-rock-rock-music-513418). */
    audio: "genre-clips/rock.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heavy%20Interlude.mp3",
    tracks: [
      { title: "Dust & Distortion" },
      { title: "Highway Hymnal" },
      { title: "Fault Line" },
      { title: "Garage Royalty" },
      { title: "Thunder In D Minor" },
    ],
  },
  {
    name: "Electronic",
    inspiredByArtists: "Daft Punk, Calvin Harris, Avicii",
    clipSlug: "electronic",
    /* Hover: monume-abstract-electronic-509472 → genre-clips/electronic.mp3 */
    audio: "genre-clips/electronic.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/EDM%20Detection%20Mode.mp3",
    tracks: [
      { title: "Pulse Lattice" },
      { title: "Analog Rain" },
      { title: "Zero-G Disco" },
      { title: "Filter Bloom" },
      { title: "Midnight Modular" },
    ],
  },
  {
    name: "R&B",
    inspiredByArtists: "Beyoncé, Usher, Whitney Houston, Stevie Wonder",
    clipSlug: "r-and-b",
    /* Hover: bundled clip at genre-clips/r-and-b.mp3 (e.g. denis-pavlov-...-rampb-soul-music-225318). */
    audio: "genre-clips/r-and-b.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lobby%20Time.mp3",
    tracks: [
      { title: "Velvet Voicemail" },
      { title: "Slow Burn Tuesday" },
      { title: "Backseat Confessional" },
      { title: "Honeycomb" },
      { title: "2AM Frequency" },
    ],
  },
  {
    name: "Country",
    inspiredByArtists: "Dolly Parton, Garth Brooks, Shania Twain, Luke Combs",
    clipSlug: "country",
    /* Hover: bundled clip — tunetank-country-music-347561 → genre-clips/country.mp3 */
    audio: "genre-clips/country.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Western%20Streets.mp3",
    tracks: [
      { title: "Dust Road Psalm" },
      { title: "Porch Light" },
      { title: "Neon Prairie" },
      { title: "Whiskey Weather" },
      { title: "Oak & Open Sky" },
    ],
  },
  {
    name: "Latin",
    inspiredByArtists: "Bad Bunny, Shakira, Romeo Santos",
    clipSlug: "latin",
    /* Hover: bundled clip at genre-clips/latin.mp3 (e.g. hitslab-latin-mexican-latino-music-474676). */
    audio: "genre-clips/latin.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Samba%20Isobel.mp3",
    tracks: [
      { title: "Caliente Horizonte" },
      { title: "Ritmo Del Barrio" },
      { title: "Medianoche Mambo" },
      { title: "Coral y Caña" },
      { title: "Sabor Electric" },
    ],
  },
  {
    name: "Indie",
    inspiredByArtists: "Arctic Monkeys, The Strokes",
    clipSlug: "indie",
    /* Hover: bundled clip at genre-clips/indie.mp3 (e.g. alex_kizenkov-soft-indie-folk-143928). */
    audio: "genre-clips/indie.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3",
    tracks: [
      { title: "Lo-Fi Cathedral" },
      { title: "Basement Bloom" },
      { title: "Patchwork Sky" },
      { title: "Cassette Constellation" },
      { title: "Quiet Riot" },
    ],
  },
  {
    name: "Metal",
    inspiredByArtists: "Metallica, Iron Maiden, Black Sabbath",
    clipSlug: "metal",
    /* Hover: bundled clip at genre-clips/metal.mp3 (e.g. alexgrohl-metal-dark-matter-111451). */
    audio: "genre-clips/metal.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Volatile%20Reaction.mp3",
    tracks: [
      { title: "Iron Liturgy" },
      { title: "Riff Apocalypse" },
      { title: "Forgeheart" },
      { title: "Bass Canyon" },
      { title: "Tempest Tuning" },
    ],
  },
  {
    name: "Jazz",
    inspiredByArtists: "Miles Davis, John Coltrane, Ella Fitzgerald",
    clipSlug: "jazz",
    /* Hover: bundled clip at genre-clips/jazz.mp3 (e.g. tunetank-jazz-background-music-349165). */
    audio: "genre-clips/jazz.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Jazz%20Brunch.mp3",
    tracks: [
      { title: "Blue Note Drift" },
      { title: "Improv Alley" },
      { title: "Midtown Nocturne" },
      { title: "Brushstroke" },
      { title: "Chord Pilgrim" },
    ],
  },
  {
    name: "Classical",
    inspiredByArtists: "Beethoven, Mozart, Vivaldi",
    clipSlug: "classical",
    /* Hover: bundled clip at genre-clips/classical.mp3 (e.g. tunetank-piano-classical-music-347514). */
    audio: "genre-clips/classical.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Gymnopedie%20No%201.mp3",
    tracks: [
      { title: "Etude In Mist" },
      { title: "Symphony sketch I" },
      { title: "Chamber Echo" },
      { title: "Arch Form" },
      { title: "Resonance Row" },
    ],
  },
  {
    name: "Folk",
    inspiredByArtists: "Bob Dylan, Joan Baez, Joni Mitchell",
    clipSlug: "folk",
    /* Full file is long — cap hover length. audioHoverPreload: buffer clip so hover starts sooner. */
    audioHoverPreload: true,
    audioHoverMaxSec: 12,
    /* Hover: caffeine_creek_band-celtic-folk-song-109238 → genre-clips/folk.mp3 */
    audio: "genre-clips/folk.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Folk%20Round.mp3",
    tracks: [
      { title: "Willow & Word" },
      { title: "Hearthsong" },
      { title: "Railroad Letter" },
      { title: "Meadow Minor" },
      { title: "Spindle Thread" },
    ],
  },
  {
    name: "Blues",
    inspiredByArtists: "B.B. King, Muddy Waters, Robert Johnson",
    clipSlug: "blues",
    /* Hover: bundled clip at genre-clips/blues.mp3 (e.g. jean-paul-v-romantic-blues-286563). */
    audio: "genre-clips/blues.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Blue%20Paint.mp3",
    tracks: [
      { title: "Crossroads Receipt" },
      { title: "Delta Hum" },
      { title: "Shuffle Testament" },
      { title: "Rail Spike Blues" },
      { title: "Rain on Tin" },
    ],
  },
  {
    name: "Reggae",
    inspiredByArtists: "Bob Marley, Peter Tosh",
    clipSlug: "reggae",
    /* Hover: bundled clip at genre-clips/reggae.mp3 (e.g. starostin-reggae-...-496206). */
    audio: "genre-clips/reggae.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Island%20Meet%20and%20Greet.mp3",
    tracks: [
      { title: "Island Telegraph" },
      { title: "One Drop Diary" },
      { title: "Sunline Skank" },
      { title: "Lionheart Lullaby" },
      { title: "Rebel Breeze" },
    ],
  },
  {
    name: "Punk",
    inspiredByArtists: "Ramones, Sex Pistols, The Clash",
    clipSlug: "punk",
    /* Hover: bundled clip at genre-clips/punk.mp3 (e.g. octosound-punk-rock-374044). */
    audio: "genre-clips/punk.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/District%20Four.mp3",
    tracks: [
      { title: "Safety Pin Anthem" },
      { title: "45 Second Manifesto" },
      { title: "Basement Broadcast" },
      { title: "Riot of One" },
      { title: "Scuffed Sneaker" },
    ],
  },
  {
    name: "Gospel",
    inspiredByArtists: "Mahalia Jackson, Kirk Franklin",
    clipSlug: "gospel",
    /* Amazing Grace — instrumental (Strolling Strings, U.S. Air Force Band). PD U.S. govt work; bundled as genre-clips/gospel.mp3 from Wikimedia Commons. */
    audioHoverMaxSec: 22,
    audio: "genre-clips/gospel.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Movement%20Proposition.mp3",
    tracks: [
      { title: "Raise the Row" },
      { title: "Refrain of Mercy" },
      { title: "Testify Tenor" },
      { title: "Wade Bonus" },
      { title: "Hallelujah Hall" },
    ],
  },
  {
    name: "Funk",
    inspiredByArtists: "James Brown, Parliament-Funkadelic",
    clipSlug: "funk",
    /* Hover: tunetank-eccentric-funk-music-348500 → genre-clips/funk.mp3 */
    audio: "genre-clips/funk.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funk%20Game%20Loop.mp3",
    tracks: [
      { title: "Bootleg Bounce" },
      { title: "Mothership Memo" },
      { title: "Clavinet Confessions" },
      { title: "Rubberband Prime" },
      { title: "Slide Night" },
    ],
  },
  {
    name: "Disco",
    inspiredByArtists: "Bee Gees, Donna Summer, Chic, Gloria Gaynor",
    clipSlug: "disco",
    /* Hover: bundled clip at genre-clips/disco.mp3 (rainbow76-disco-fever-retro-disco-energetic-and-nostalgic-70s-vibe-rain-459307). */
    audioHoverMaxSec: 18,
    audio: "genre-clips/disco.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Disco%20Medusae.mp3",
    tracks: [
      { title: "Mirror Ball Confessional" },
      { title: "Saturday Night Satellite" },
      { title: "Four-on-the-Floor Faith" },
      { title: "Velvet Rope Refrain" },
      { title: "Last Dance Latitude" },
    ],
  },
  {
    name: "Holidays",
    inspiredByArtists: "Mariah Carey, Bing Crosby, José Feliciano, Pentatonix",
    clipSlug: "holidays",
    /* Hover: bundled clip at genre-clips/holidays.mp3 (tunetank-christmas-jazz-christmas-holiday-347485). */
    audioHoverMaxSec: 18,
    audio: "genre-clips/holidays.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Jingle%20Punks.mp3",
    tracks: [
      { title: "Snow Globe Serenade" },
      { title: "Mistletoe Motif" },
      { title: "Evergreen Echo" },
      { title: "Candlelight Canon" },
      { title: "Midnight Mass Transit" },
    ],
  },
  {
    name: "Soundtracks",
    inspiredByArtists: "Hans Zimmer, John Williams, Ludwig Göransson",
    clipSlug: "soundtracks",
    /* Hover: good_b_music-honor-and-sword-main-11222 → genre-clips/soundtracks.mp3 */
    audio: "genre-clips/soundtracks.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Movement%20Proposition.mp3",
    tracks: [
      { title: "Opening Titles (Rough)" },
      { title: "Cue Stack" },
      { title: "Motif Return" },
      { title: "Scene Change" },
      { title: "End Credits Tease" },
    ],
  },
  {
    name: "K-Pop",
    inspiredByArtists: "BTS, BLACKPINK",
    clipSlug: "k-pop",
    /* Hover: ultrafi-seoul-skyline-lofi-k-pop-beats-for-focus-amp-study-476583 → genre-clips/k-pop.mp3 */
    audio: "genre-clips/k-pop.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Hamster%20March.mp3",
    tracks: [
      { title: "Mirror Stage" },
      { title: "Cherry Bombadier" },
      { title: "Trainee Twilight" },
      { title: "Fanlight Canon" },
      { title: "Idol Physics" },
    ],
  },
  {
    name: "Other",
    inspiredByArtists: "Various artists",
    clipSlug: "other",
    /* Hover: nastelbom-happy-birthday-471481 → genre-clips/other.mp3 */
    audio: "genre-clips/other.mp3",
    audioFallback:
      "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Amazing%20Plan.mp3",
    tracks: [
      { title: "Genre Unknown" },
      { title: "File Under Elsewhere" },
      { title: "Tag Missing" },
      { title: "Session X" },
      { title: "Your Label Here" },
    ],
  },
];

/** Frozen copy for merging user publishes without losing bundled demos */
window.SONG_SHARE_GENRES_BASE = JSON.parse(JSON.stringify(window.SONG_SHARE_GENRES));
