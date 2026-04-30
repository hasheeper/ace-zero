/**
 * AceZero ACT generated-route static data.
 *
 * Loaded before act/plugin.js by st-bridge manifest. This file contains
 * large declarative motif/lane/name tables used by the generated chapter tail.
 */
(function installAceZeroActGeneratedData(global) {
  'use strict';

  const GENERATED_TAIL_MOTIF_REGISTRY = {
      fan_arc: {
        id: 'fan_arc',
        size: 3,
        counts: [1, 2, 1],
        transitions: [
          [[0, 1]],
          [[0], [0]]
        ]
      },
      double_offset: {
        id: 'double_offset',
        size: 3,
        counts: [2, 2, 1],
        transitions: [
          [[0], [0, 1]],
          [[0], [0]]
        ]
      },
      tri_shear: {
        id: 'tri_shear',
        size: 3,
        counts: [1, 2, 2],
        transitions: [
          [[0, 1]],
          [[0], [0, 1]]
        ]
      },
      late_split: {
        id: 'late_split',
        size: 3,
        counts: [1, 1, 2],
        transitions: [
          [[0]],
          [[0, 1]]
        ]
      },
      stagger_fork: {
        id: 'stagger_fork',
        size: 3,
        counts: [2, 1, 2],
        transitions: [
          [[0], [0]],
          [[0, 1]]
        ]
      },
      double_hold: {
        id: 'double_hold',
        size: 3,
        counts: [2, 2, 2],
        transitions: [
          [[0], [0, 1]],
          [[0, 1], [1]]
        ]
      },
      double_keep: {
        id: 'double_keep',
        size: 3,
        counts: [2, 2, 2],
        transitions: [
          [[0], [1]],
          [[0], [1]]
        ]
      },
      quad_fan: {
        id: 'quad_fan',
        size: 3,
        counts: [2, 4, 4],
        transitions: [
          [[0, 1], [2, 3]],
          [[0], [1], [2], [3]]
        ]
      },
      quad_hold: {
        id: 'quad_hold',
        size: 3,
        counts: [3, 4, 4],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0], [1], [2], [3]]
        ]
      },
      sts_early_a: {
        id: 'sts_early_a',
        size: 3,
        counts: [2, 3, 3],
        transitions: [
          [[0, 1], [1, 2]],
          [[0, 1], [1], [1, 2]]
        ]
      },
      sts_early_b: {
        id: 'sts_early_b',
        size: 3,
        counts: [2, 3, 4],
        transitions: [
          [[0, 1], [1, 2]],
          [[0, 1], [1, 2], [2, 3]]
        ]
      },
      sts_early_c: {
        id: 'sts_early_c',
        size: 3,
        counts: [2, 3, 4],
        transitions: [
          [[0, 1], [1, 2]],
          [[0], [1, 2], [2, 3]]
        ]
      },
      sts_mid_a: {
        id: 'sts_mid_a',
        size: 3,
        counts: [3, 4, 3],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0], [1, 2], [2]]
        ]
      },
      sts_mid_b: {
        id: 'sts_mid_b',
        size: 3,
        counts: [3, 4, 4],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0, 1], [1, 2], [2, 3], [3]]
        ]
      },
      sts_mid_c: {
        id: 'sts_mid_c',
        size: 3,
        counts: [3, 3, 4],
        transitions: [
          [[0], [1], [1, 2]],
          [[0, 1], [1, 2], [2, 3]]
        ]
      },
      sts_spread_a: {
        id: 'sts_spread_a',
        size: 3,
        counts: [3, 4, 3],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0], [1, 2], [2]]
        ]
      },
      sts_spread_b: {
        id: 'sts_spread_b',
        size: 3,
        counts: [3, 3, 4],
        transitions: [
          [[0], [1], [1, 2]],
          [[0, 1], [1, 2], [2, 3]]
        ]
      },
      sts_spread_c: {
        id: 'sts_spread_c',
        size: 3,
        counts: [4, 4, 3],
        transitions: [
          [[0], [1], [2], [2, 3]],
          [[0], [0, 1], [1, 2], [2]]
        ]
      },
      sts_braid_a: {
        id: 'sts_braid_a',
        size: 3,
        counts: [3, 4, 4],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0], [1, 2], [2, 3], [3]]
        ]
      },
      sts_braid_b: {
        id: 'sts_braid_b',
        size: 3,
        counts: [4, 4, 4],
        transitions: [
          [[0], [0, 1], [2, 3], [3]],
          [[0, 1], [1], [2], [2, 3]]
        ]
      },
      cross_bridge: {
        id: 'cross_bridge',
        size: 4,
        counts: [2, 2, 2, 1],
        transitions: [
          [[0], [0, 1]],
          [[0, 1], [1]],
          [[0], [0]]
        ]
      },
      tri_compress: {
        id: 'tri_compress',
        size: 4,
        counts: [1, 3, 2, 1],
        transitions: [
          [[0, 1, 2]],
          [[0], [0, 1], [1]],
          [[0], [0]]
        ]
      },
      parallel_detour: {
        id: 'parallel_detour',
        size: 4,
        counts: [2, 1, 2, 1],
        transitions: [
          [[0], [0]],
          [[0, 1]],
          [[0], [0]]
        ]
      },
      double_weave: {
        id: 'double_weave',
        size: 4,
        counts: [2, 3, 2, 1],
        transitions: [
          [[0, 1], [1, 2]],
          [[0], [0, 1], [1]],
          [[0], [0]]
        ]
      },
      tri_open: {
        id: 'tri_open',
        size: 4,
        counts: [2, 2, 3, 2],
        transitions: [
          [[0], [0, 1]],
          [[0, 1], [1, 2]],
          [[0, 1], [1]]
        ]
      },
      tri_hold: {
        id: 'tri_hold',
        size: 4,
        counts: [1, 2, 3, 2],
        transitions: [
          [[0, 1]],
          [[0, 1], [1, 2]],
          [[0], [0, 1], [1]]
        ]
      },
      dual_branch_rise: {
        id: 'dual_branch_rise',
        size: 4,
        counts: [2, 2, 3, 3],
        transitions: [
          [[0], [1]],
          [[0, 1], [1, 2]],
          [[0], [1], [2]]
        ]
      },
      tri_branch_hold: {
        id: 'tri_branch_hold',
        size: 4,
        counts: [2, 3, 3, 2],
        transitions: [
          [[0, 1], [1, 2]],
          [[0], [1], [2]],
          [[0], [0, 1], [1]]
        ]
      },
      tri_sprawl: {
        id: 'tri_sprawl',
        size: 4,
        counts: [2, 3, 3, 3],
        transitions: [
          [[0, 1], [1, 2]],
          [[0, 1], [1], [1, 2]],
          [[0], [1], [2]]
        ]
      },
      double_weave_open: {
        id: 'double_weave_open',
        size: 4,
        counts: [2, 2, 2, 2],
        transitions: [
          [[0], [0, 1]],
          [[0, 1], [1]],
          [[0], [1]]
        ]
      },
      pent_spike: {
        id: 'pent_spike',
        size: 4,
        counts: [2, 4, 5, 4],
        transitions: [
          [[0, 1], [2, 3]],
          [[0, 1], [1, 2], [2], [2, 3], [3, 4]],
          [[0], [1], [2], [3]]
        ]
      },
      pent_weave: {
        id: 'pent_weave',
        size: 4,
        counts: [3, 5, 4, 3],
        transitions: [
          [[0, 1], [1, 2, 3], [3, 4]],
          [[0, 1], [1, 2], [2, 3], [3]],
          [[0], [1], [2]]
        ]
      },
      offlane_drift: {
        id: 'offlane_drift',
        size: 4,
        counts: [2, 3, 5, 4],
        transitions: [
          [[0, 1], [1, 2]],
          [[0, 1], [1, 2, 3], [3, 4]],
          [[0, 1], [1, 2], [2, 3], [3]]
        ]
      },
      late_collapse_wide: {
        id: 'late_collapse_wide',
        size: 4,
        counts: [4, 4, 3, 1],
        transitions: [
          [[0], [1], [2], [3]],
          [[0], [1], [1, 2], [2]],
          [[0], [0], [0]]
        ]
      },
      sts_peak_a: {
        id: 'sts_peak_a',
        size: 4,
        counts: [3, 4, 5, 4],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0, 1], [1, 2], [2], [2, 3], [3, 4]],
          [[0], [1], [2, 3], [3]]
        ]
      },
      sts_peak_b: {
        id: 'sts_peak_b',
        size: 4,
        counts: [4, 5, 4, 3],
        transitions: [
          [[0, 1], [1], [2, 3], [3, 4]],
          [[0], [1, 2], [2, 3], [3, 4], [4]],
          [[0], [0, 1], [1, 2], [2]]
        ]
      },
      sts_peak_c: {
        id: 'sts_peak_c',
        size: 4,
        counts: [3, 5, 5, 4],
        transitions: [
          [[0, 1], [1, 2, 3], [3, 4]],
          [[0], [1, 2], [2], [2, 3], [3, 4]],
          [[0], [1], [2, 3], [3], [3]]
        ]
      },
      sts_peak_d: {
        id: 'sts_peak_d',
        size: 4,
        counts: [4, 5, 4, 4],
        transitions: [
          [[0], [0, 1], [2, 3], [3, 4]],
          [[0, 1], [1], [2, 3], [3], [3]],
          [[0], [1], [2], [3]]
        ]
      },
      sts_peak_e: {
        id: 'sts_peak_e',
        size: 4,
        counts: [3, 4, 4, 3],
        transitions: [
          [[0, 1], [1, 2], [2, 3]],
          [[0, 1], [1, 2], [2, 3], [3]],
          [[0], [1, 2], [2], [2]]
        ]
      },
      sts_final_a: {
        id: 'sts_final_a',
        size: 3,
        counts: [3, 2, 1],
        transitions: [
          [[0], [0, 1], [1]],
          [[0], [0]]
        ]
      },
      sts_final_b: {
        id: 'sts_final_b',
        size: 3,
        counts: [4, 2, 1],
        transitions: [
          [[0], [0], [1], [1]],
          [[0], [0]]
        ]
      },
      sts_final_c: {
        id: 'sts_final_c',
        size: 3,
        counts: [3, 3, 1],
        transitions: [
          [[0], [1], [1, 2]],
          [[0], [0], [0]]
        ]
      }
    };

  const GENERATED_LANE_DEFS = [
      { key: 'white', branchIndex: 0, subtitle: 'UPPER LINE', title: 'WHITE LINE' },
      { key: 'blue', branchIndex: 1, subtitle: 'MID-UPPER LINE', title: 'BLUE LINE' },
      { key: 'orange', branchIndex: 2, subtitle: 'MID-LOWER LINE', title: 'ORANGE LINE' },
      { key: 'red', branchIndex: 3, subtitle: 'LOWER LINE', title: 'RED LINE' },
      { key: 'neutral', branchIndex: 2, subtitle: 'CROSS GATE', title: 'NEUTRAL GATE' }
    ];

  const LANE_BRIDGE_PROFILES = [
      ['hold', 'upper', 'hold', 'middle', 'hold', 'lower', 'hold', 'dual', 'hold', 'middle'],
      ['upper', 'hold', 'middle', 'hold', 'dual', 'hold', 'lower', 'hold', 'middle', 'hold'],
      ['hold', 'dual', 'hold', 'upper', 'hold', 'middle', 'hold', 'lower', 'hold', 'upper'],
      ['middle', 'hold', 'upper', 'hold', 'lower', 'hold', 'dual', 'hold', 'middle', 'hold']
    ];

  const NODE_NAME_A_WORDS = [
      'Red', 'Black', 'White', 'Grey', 'Rust', 'Dust', 'Ash', 'Cold', 'Thin', 'Open',
      'Closed', 'Silent', 'Dead', 'Empty', 'Split', 'False', 'Final', 'Last', 'First', 'Zero',
      'Wet', 'Pale', 'Burnt', 'Marked', 'Null', 'Void', 'Broken', 'Hidden', 'Side', 'Slow'
    ];

  const NODE_NAME_B_WORDS = [
      'Stamp', 'Receipt', 'Ledger', 'Clause', 'Record', 'Notice', 'Claim', 'Entry', 'Draft', 'Seal',
      'File', 'Margin', 'Slip', 'Balance', 'Writ', 'Bond', 'Register', 'Audit', 'Voucher', 'Ledgerline',
      'Gate', 'Hall', 'Counter', 'Booth', 'Window', 'Floor', 'Valve', 'Pipe', 'Exit', 'Lamp',
      'Rail', 'Shaft', 'Tower', 'Vault', 'Door', 'Track', 'Channel', 'Terminal', 'Stair', 'Corridor',
      'Blind', 'Pot', 'Call', 'Raise', 'River', 'Burn', 'Tell', 'Stack', 'Marker', 'Hand',
      'Draw', 'Seat', 'Table', 'Count', 'Sidepot', 'Fold', 'Ante', 'Chip', 'Dealer', 'Turn',
      'Mark', 'Thread', 'Index', 'Signal', 'Trace', 'Slot', 'Key', 'Flag', 'Code', 'Tag',
      'Phase', 'Line', 'Trigger', 'Link', 'Path', 'Echo', 'Core', 'Lock',
      'Debt', 'Burden', 'Residue', 'Load', 'Scar', 'Weight', 'Fault', 'Sink', 'Break', 'Drift',
      'Vessel', 'Chain', 'Ruin', 'Leak', 'Pressure', 'Threshold', 'Collapse'
    ];

  global.ACE0ActGeneratedData = Object.assign({}, global.ACE0ActGeneratedData || {}, {
    GENERATED_TAIL_MOTIF_REGISTRY,
    GENERATED_LANE_DEFS,
    LANE_BRIDGE_PROFILES,
    NODE_NAME_A_WORDS,
    NODE_NAME_B_WORDS
  });
})(typeof window !== 'undefined' ? window : globalThis);
