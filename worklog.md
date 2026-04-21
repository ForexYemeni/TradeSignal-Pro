---
Task ID: 1
Agent: Main
Task: Update Google Apps Script v5.0 to match Pine Script v3.7 format

Work Log:
- Analyzed Pine Script v3.7 build functions (buildEnt, buildTPA, buildSLA, buildBE, buildPyrEnt, buildPyrTPA, buildPyrSLA, buildReEnt, buildReTPA, buildReSLA)
- Analyzed signal-parser.ts regex patterns for all 11 signal categories
- Updated all build functions to match v3.7 box-drawing format (╔══╗║╚══╝)
- Added BREAKEVEN (BE) detection and build functions
- Added 3 SL variants: full loss, BE hit at entry, partial win
- Added price jump text builder
- Updated detectCategory with correct priority order matching parser
- Added test functions: testBreakeven, testSLBeHit, testSLPartial, testBEHit, testPartialWin, testAllTypes
- Added scenario test functions for complete trade workflows

Stage Summary:
- Updated Google Apps Script from v5.0 to v6.0
- All build functions now match Pine Script v3.7 output format exactly
- BREAKEVEN support added (was missing in v5.0)
- 11 signal types fully supported: ENTRY, TP_HIT, SL_HIT, BREAKEVEN, PYRAMID, PYRAMID_TP, PYRAMID_SL, REENTRY, REENTRY_TP, REENTRY_SL
