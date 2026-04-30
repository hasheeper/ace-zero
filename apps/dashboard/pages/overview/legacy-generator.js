(function initAce0OverviewLegacyGenerator(global) {
    'use strict';

    function createSeedHash(seed) {
        let hash = 1779033703 ^ seed.length;
        for (let index = 0; index < seed.length; index += 1) {
            hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
            hash = (hash << 13) | (hash >>> 19);
        }
        return () => {
            hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
            hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
            hash ^= hash >>> 16;
            return hash >>> 0;
        };
    }

    function createSeededRng(seed) {
        const seedHash = createSeedHash(seed);
        let state = seedHash();
        return () => {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function cloneNodeTemplate(template) {
        return JSON.parse(JSON.stringify(template));
    }

    function createRuntimeSeed() {
        const timeToken = Date.now().toString(36).toUpperCase();
        const randToken = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `DEMO-${timeToken}-${randToken}`;
    }

    function shuffleWithRng(items, rng) {
        const list = [...items];
        for (let index = list.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(rng() * (index + 1));
            const temp = list[index];
            list[index] = list[swapIndex];
            list[swapIndex] = temp;
        }
        return list;
    }

    function pickWeightedIndex(items, rng) {
        const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
        let roll = rng() * Math.max(totalWeight, 1);
        for (let index = 0; index < items.length; index += 1) {
            roll -= items[index].weight ?? 1;
            if (roll <= 0) return index;
        }
        return items.length - 1;
    }

    function chooseNodeFromPool(candidates, rng) {
        if (!candidates.length) return null;
        return candidates.splice(pickWeightedIndex(candidates, rng), 1)[0];
    }

    function getNodeLabelForSlot(nodeIndex, slotIndex) {
        const suffix = String.fromCharCode(65 + slotIndex);
        return `NODE_${String(nodeIndex).padStart(2, '0')}_${suffix}`;
    }

    function normalizeProfileConstraints(profile) {
        return {
            uniquePoolIds: Boolean(profile.constraints?.uniquePoolIds),
            maxPerKey: profile.constraints?.maxPerKey || {},
            requiredKeys: profile.constraints?.requiredKeys || [],
            preferredPresentKeys: profile.constraints?.preferredPresentKeys || [],
            focusSlotId: profile.constraints?.focusSlotId || profile.slotIds?.[0] || null
        };
    }

    function buildEligibleNodePool(profile, selectedPoolEntries, constraints) {
        const selectedKeyCounts = selectedPoolEntries.reduce((counts, entry) => {
            counts[entry.key] = (counts[entry.key] || 0) + 1;
            return counts;
        }, {});
        return profile.nodePool.filter((entry) => {
            if (constraints.uniquePoolIds && selectedPoolEntries.some((selected) => selected.poolId === entry.poolId)) return false;
            const maxPerKey = constraints.maxPerKey[entry.key];
            if (maxPerKey && (selectedKeyCounts[entry.key] || 0) >= maxPerKey) return false;
            return true;
        });
    }

    function generateNodesFromRandomProfile(nodeIndex, profile, rng) {
        const constraints = normalizeProfileConstraints(profile);
        const selectedPoolEntries = [];
        const slotIds = profile.slotIds || [];

        constraints.requiredKeys.forEach((requiredKey) => {
            const eligible = buildEligibleNodePool(profile, selectedPoolEntries, constraints)
                .filter((entry) => entry.key === requiredKey);
            const selectedEntry = chooseNodeFromPool([...eligible], rng);
            if (selectedEntry) selectedPoolEntries.push(selectedEntry);
        });

        while (selectedPoolEntries.length < slotIds.length) {
            const eligible = buildEligibleNodePool(profile, selectedPoolEntries, constraints);
            if (!eligible.length) break;
            const selectedEntry = chooseNodeFromPool([...eligible], rng);
            if (!selectedEntry) break;
            selectedPoolEntries.push(selectedEntry);
        }

        const orderedPoolEntries = shuffleWithRng(selectedPoolEntries.slice(0, slotIds.length), rng);
        const nodes = slotIds.map((slotId, slotIndex) => {
            const poolEntry = orderedPoolEntries[slotIndex];
            return {
                id: slotId,
                key: poolEntry?.key || 'vision',
                label: getNodeLabelForSlot(nodeIndex, slotIndex),
                sublabel: poolEntry?.sublabel || 'UNASSIGNED NODE',
                isBranch: Boolean(poolEntry?.isBranch),
                debugPoolId: poolEntry?.poolId || 'fallback'
            };
        });

        const preferredNode = nodes.find((node) => constraints.preferredPresentKeys.includes(node.key));
        const focusNode = nodes.find((node) => node.id === constraints.focusSlotId) || nodes[0] || null;
        const presentNodeId = preferredNode?.id || focusNode?.id || null;

        return {
            nodes,
            mapFocus: presentNodeId || focusNode?.id || null,
            presentNode: presentNodeId || focusNode?.id || null,
            debugNodePool: orderedPoolEntries.map((entry) => entry.poolId)
        };
    }

    function buildGeneratedNode(nodeConfig, template) {
        const clonedTemplate = cloneNodeTemplate(template);
        return {
            nodeIndex: nodeConfig.nodeIndex,
            label: `NODE ${String(nodeConfig.nodeIndex).padStart(2, '0')}`,
            deadNodes: [],
            ...clonedTemplate,
            debug: {
                nodeKind: nodeConfig.kind,
                sourceId: nodeConfig.templateId || null,
                generatorMode: nodeConfig.kind
            }
        };
    }

    function generateCampaignNodes(campaignConfig) {
        const nodeSequence = Array.isArray(campaignConfig?.nodeSequence) ? campaignConfig.nodeSequence : [];
        if (!nodeSequence.length) return [];
        const rng = createSeededRng(campaignConfig.seed);
        return nodeSequence.map((nodeConfig) => {
            if (nodeConfig.kind === 'fixed') {
                const template = campaignConfig.fixedNodeTemplates[nodeConfig.templateId];
                return buildGeneratedNode(nodeConfig, template);
            }

            const pool = nodeConfig.pool || [];
            const selectedTemplateId = pool[Math.floor(rng() * pool.length)] || pool[0];
            const template = campaignConfig.randomNodeTemplates[selectedTemplateId];
            const generatedNodes = generateNodesFromRandomProfile(nodeConfig.nodeIndex, template, rng);
            return {
                ...buildGeneratedNode(nodeConfig, template),
                nodes: generatedNodes.nodes,
                mapFocus: generatedNodes.mapFocus,
                presentNode: generatedNodes.presentNode,
                debug: {
                    nodeKind: nodeConfig.kind,
                    sourceId: selectedTemplateId,
                    generatorMode: 'profile+pool',
                    nodePool: generatedNodes.debugNodePool
                }
            };
        });
    }

    global.ACE0OverviewLegacyGenerator = Object.freeze({
        createRuntimeSeed,
        generateCampaignNodes
    });
})(typeof window !== 'undefined' ? window : globalThis);
