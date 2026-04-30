#!/usr/bin/env python3
'use strict'

import time
from pathlib import Path

import torch


ROOT = Path('/Users/liuhang/Documents/acezero/third_party/Mortal')
MORTAL_DIR = ROOT / 'mortal'
MODELS_DIR = ROOT / 'models'


def main() -> None:
    import sys

    sys.path.insert(0, str(MORTAL_DIR))

    from model import Brain, DQN

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    version = 4
    conv_channels = 192
    num_blocks = 40

    brain = Brain(version=version, conv_channels=conv_channels, num_blocks=num_blocks).eval()
    dqn = DQN(version=version).eval()

    state = {
        'config': {
            'control': {
                'version': version,
            },
            'resnet': {
                'conv_channels': conv_channels,
                'num_blocks': num_blocks,
            },
        },
        'tag': 'mortal-smoke-local',
        'timestamp': int(time.time()),
        'mortal': brain.state_dict(),
        'current_dqn': dqn.state_dict(),
    }

    target = MODELS_DIR / 'mortal-smoke.pth'
    torch.save(state, target)
    print(target)


if __name__ == '__main__':
    main()
