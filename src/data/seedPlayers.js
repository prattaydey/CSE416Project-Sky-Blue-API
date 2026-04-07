const seedPlayers = [
  // AL Hitters
  { playerId: 592450, name: "Aaron Judge", position: ["OF"], team: "NYY", mlbTeamId: 147, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.311, HR: 58, RBI: 144, SB: 16 } },
  { playerId: 668939, name: "Adley Rutschman", position: ["C"], team: "BAL", mlbTeamId: 110, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.277, HR: 20, RBI: 80, SB: 6 } },
  { playerId: 677951, name: "Bobby Witt Jr.", position: ["SS"], team: "KC", mlbTeamId: 118, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.332, HR: 32, RBI: 109, SB: 49 } },
  { playerId: 608070, name: "Jose Ramirez", position: ["3B"], team: "CLE", mlbTeamId: 114, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.28, HR: 39, RBI: 118, SB: 41 } },
  { playerId: 543760, name: "Marcus Semien", position: ["2B"], team: "TEX", mlbTeamId: 140, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.276, HR: 29, RBI: 100, SB: 14 } },
  { playerId: 670541, name: "Yordan Alvarez", position: ["DH", "OF"], team: "HOU", mlbTeamId: 117, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.293, HR: 35, RBI: 97, SB: 1 } },
  { playerId: 665742, name: "Juan Soto", position: ["OF"], team: "NYY", mlbTeamId: 147, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.288, HR: 41, RBI: 109, SB: 6 } },
  { playerId: 671272, name: "Gunnar Henderson", position: ["SS", "3B"], team: "BAL", mlbTeamId: 110, league: "AL", isPitcher: false, status: "active", stats: { BA: 0.282, HR: 37, RBI: 96, SB: 15 } },

  // NL Hitters
  { playerId: 605141, name: "Freddie Freeman", position: ["1B"], team: "LAD", mlbTeamId: 119, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.331, HR: 29, RBI: 102, SB: 13 } },
  { playerId: 621566, name: "Mookie Betts", position: ["OF", "SS"], team: "LAD", mlbTeamId: 119, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.289, HR: 19, RBI: 75, SB: 16 } },
  { playerId: 660271, name: "Shohei Ohtani", position: ["DH"], team: "LAD", mlbTeamId: 119, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.304, HR: 54, RBI: 130, SB: 59 } },
  { playerId: 660670, name: "Ronald Acuna Jr.", position: ["OF"], team: "ATL", mlbTeamId: 144, league: "NL", isPitcher: false, status: "injured", injuryStatus: "Knee - ACL", stats: { BA: 0.337, HR: 41, RBI: 106, SB: 73 } },
  { playerId: 669257, name: "Will Smith", position: ["C"], team: "LAD", mlbTeamId: 119, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.261, HR: 19, RBI: 76, SB: 1 } },
  { playerId: 666971, name: "Elly De La Cruz", position: ["SS"], team: "CIN", mlbTeamId: 113, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.262, HR: 25, RBI: 76, SB: 67 } },
  { playerId: 665487, name: "Trea Turner", position: ["SS"], team: "PHI", mlbTeamId: 143, league: "NL", isPitcher: false, status: "active", stats: { BA: 0.295, HR: 21, RBI: 61, SB: 30 } },

  // AL Pitchers
  { playerId: 543037, name: "Gerrit Cole", position: ["SP"], team: "NYY", mlbTeamId: 147, league: "AL", isPitcher: true, status: "active", stats: { ERA: 2.63, W: 15, SV: 0, K: 222, IP: 209.0 } },
  { playerId: 661403, name: "Emmanuel Clase", position: ["RP"], team: "CLE", mlbTeamId: 114, league: "AL", isPitcher: true, status: "active", stats: { ERA: 0.61, W: 4, SV: 44, K: 66, IP: 74.1 } },
  { playerId: 623352, name: "Josh Hader", position: ["RP"], team: "HOU", mlbTeamId: 117, league: "AL", isPitcher: true, status: "active", stats: { ERA: 1.28, W: 8, SV: 33, K: 71, IP: 56.1 } },
  { playerId: 663556, name: "Tarik Skubal", position: ["SP"], team: "DET", mlbTeamId: 116, league: "AL", isPitcher: true, status: "active", stats: { ERA: 2.39, W: 18, SV: 0, K: 228, IP: 192.0 } },
  { playerId: 656302, name: "Seth Lugo", position: ["SP"], team: "KC", mlbTeamId: 118, league: "AL", isPitcher: true, status: "active", stats: { ERA: 3.00, W: 16, SV: 0, K: 185, IP: 206.2 } },

  // NL Pitchers
  { playerId: 669203, name: "Corbin Burnes", position: ["SP"], team: "ARI", mlbTeamId: 109, league: "NL", isPitcher: true, status: "active", stats: { ERA: 2.92, W: 15, SV: 0, K: 181, IP: 194.1 } },
  { playerId: 675911, name: "Spencer Strider", position: ["SP"], team: "ATL", mlbTeamId: 144, league: "NL", isPitcher: true, status: "injured", injuryStatus: "Elbow - UCL", stats: { ERA: 3.86, W: 20, SV: 0, K: 281, IP: 186.2 } },
  { playerId: 571945, name: "Zack Wheeler", position: ["SP"], team: "PHI", mlbTeamId: 143, league: "NL", isPitcher: true, status: "active", stats: { ERA: 2.57, W: 16, SV: 0, K: 224, IP: 200.0 } },
  { playerId: 656427, name: "Chris Sale", position: ["SP"], team: "ATL", mlbTeamId: 144, league: "NL", isPitcher: true, status: "active", stats: { ERA: 2.38, W: 18, SV: 0, K: 225, IP: 177.2 } },
  { playerId: 682847, name: "Paul Skenes", position: ["SP"], team: "PIT", mlbTeamId: 134, league: "NL", isPitcher: true, status: "active", stats: { ERA: 1.96, W: 11, SV: 0, K: 170, IP: 133.0 } },
];

module.exports = seedPlayers;
