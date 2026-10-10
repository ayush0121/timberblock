/**
 * Achievements: what they are, and which ones a player has earned.
 *
 * Each check reads the profile (lifetime stats, bests, streaks), so earning
 * is just "is this now true?" - no event bookkeeping, nothing to get out of
 * sync, and a profile restored from anywhere re-derives the same set.
 * Some unlock skins (see ui/themes.js `unlock`).
 */

const s = (p) => p.stats || {};

export const ACHIEVEMENTS = [
  // clearing
  { id: "first_clear", name: "First clear",   desc: "Clear your first line.",                      test: (p) => s(p).lines >= 1 },
  { id: "double",      name: "Double",        desc: "Clear 2 lines with one piece.",               test: (p) => s(p).maxLines >= 2 },
  { id: "triple",      name: "Triple",        desc: "Clear 3 lines with one piece.",               test: (p) => s(p).maxLines >= 3 },
  { id: "quad",        name: "Unreal",        desc: "Clear 4 or more lines with one piece.",       test: (p) => s(p).maxLines >= 4 },
  { id: "perfect",     name: "Clean sweep",   desc: "Empty the whole board.",                      test: (p) => s(p).perfect >= 1 },
  { id: "perfect5",    name: "Neat freak",    desc: "Empty the whole board 5 times.",              test: (p) => s(p).perfect >= 5 },
  // combos
  { id: "combo3",      name: "Warming up",    desc: "Reach a ×3 combo.",                           test: (p) => s(p).bestCombo >= 3 },
  { id: "combo5",      name: "On fire",       desc: "Reach a ×5 combo.",                           test: (p) => s(p).bestCombo >= 5 },
  { id: "combo8",      name: "Unstoppable",   desc: "Reach a ×8 combo.",                           test: (p) => s(p).bestCombo >= 8 },
  // volume
  { id: "lines100",    name: "Woodworker",    desc: "Clear 100 lines in total.",                   test: (p) => s(p).lines >= 100 },
  { id: "lines1000",   name: "Master joiner", desc: "Clear 1,000 lines in total.",                 test: (p) => s(p).lines >= 1000 },
  { id: "games10",     name: "Regular",       desc: "Play 10 games.",                              test: (p) => (p.games || 0) >= 10 },
  { id: "games100",    name: "Devoted",       desc: "Play 100 games.",                             test: (p) => (p.games || 0) >= 100 },
  // scores
  { id: "score1k",     name: "Four figures",  desc: "Score 1,000 in one Classic game.",            test: (p) => (p.best?.classic || 0) >= 1000 },
  { id: "score3k",     name: "High roller",   desc: "Score 3,000 in one Classic game.",            test: (p) => (p.best?.classic || 0) >= 3000 },
  { id: "score10k",    name: "Legend",        desc: "Score 10,000 in one Classic game.",           test: (p) => (p.best?.classic || 0) >= 10000 },
  { id: "pro5",        name: "Professional",  desc: "Reach level 5 in Professional.",              test: (p) => (p.bestLevel || 0) >= 5 },
  { id: "pro10",       name: "Beat the clock", desc: "Reach level 10 in Professional.",            test: (p) => (p.bestLevel || 0) >= 10 },
  // daily
  { id: "daily1",      name: "Daily player",  desc: "Finish a Daily Seed.",                        test: (p) => s(p).dailies >= 1 },
  { id: "streak3",     name: "Habit",         desc: "Reach a 3-day streak.",                       test: (p) => (p.maxStreak || 0) >= 3 },
  { id: "streak7",     name: "Week strong",   desc: "Reach a 7-day streak.",                       test: (p) => (p.maxStreak || 0) >= 7 },
  { id: "streak30",    name: "Month strong",  desc: "Reach a 30-day streak.",                      test: (p) => (p.maxStreak || 0) >= 30 },
  { id: "top10",       name: "Top ten",       desc: "Finish in the top 10 of a Daily Seed.",       test: (p) => (s(p).bestRank || 999) <= 10 },
  { id: "first",       name: "Number one",    desc: "Finish first on a Daily Seed.",               test: (p) => (s(p).bestRank || 999) === 1 },
  // social and modes
  { id: "challenger",  name: "Challenger",    desc: "Send a friend a challenge.",                  test: (p) => s(p).sent >= 1 },
  { id: "rival",       name: "Rival",         desc: "Beat a friend's challenge.",                  test: (p) => s(p).beaten >= 1 },
  { id: "zen",         name: "Inner peace",   desc: "Clear 50 lines in one Zen session.",          test: (p) => (p.best?.zenLines || 0) >= 50 },
  { id: "adv5",        name: "Explorer",      desc: "Complete Adventure level 5.",                test: (p) => (p.adventure?.level || 1) > 5 },
  { id: "adv25",       name: "Pathfinder",    desc: "Complete Adventure level 25.",               test: (p) => (p.adventure?.level || 1) > 25 },
  { id: "stars30",     name: "Star collector", desc: "Earn 30 stars in Adventure.",               test: (p) => Object.values(p.adventure?.stars || {}).reduce((a, b) => a + b, 0) >= 30 },
  { id: "event1",      name: "Eventful",      desc: "Play a weekly event.",                       test: (p) => s(p).events >= 1 },
  { id: "eventTop10",  name: "Event star",    desc: "Reach the top 10 of a weekly event.",        test: (p) => (s(p).bestEventRank || 999) <= 10 },
  { id: "quests10",    name: "Quest taker",   desc: "Complete 10 daily quests.",                  test: (p) => s(p).quests >= 10 },
  { id: "quests50",    name: "Adventurer's guild", desc: "Complete 50 daily quests.",             test: (p) => s(p).quests >= 50 },
  { id: "archive5",    name: "Historian",     desc: "Play 5 past Daily Seeds from the archive.",   test: (p) => s(p).archive >= 5 },
  { id: "season_halloween2026", name: "Halloween 2026", desc: "Play the Halloween Night board (17–31 Oct 2026).", test: (p) => !!(p.seasons && p.seasons.halloween2026) },
  { id: "season_diwali2026",    name: "Diwali 2026",    desc: "Play the Festival of Lights board (1–15 Nov 2026).", test: (p) => !!(p.seasons && p.seasons.diwali2026) },
  { id: "student",     name: "Good student",  desc: "Finish the tutorial.",                        test: (p) => !!s(p).tutorial },
];

export const byId = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/**
 * Award everything newly true. Mutates `profile.trophies` ({id: dateKey})
 * and returns the achievements earned by this call, for the toasts.
 */
export function award(profile, today) {
  profile.trophies = profile.trophies || {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.trophies[a.id]) continue;
    let got = false;
    try { got = !!a.test(profile); } catch (e) { got = false; }
    if (got) { profile.trophies[a.id] = today; fresh.push(a); }
  }
  return fresh;
}

export const earnedCount = (profile) => Object.keys(profile.trophies || {}).length;
