(function initAce0OverviewCampaignRuntime(global) {
    'use strict';

    function getSelectableNodeIds(nodeTemplate) {
        if (!nodeTemplate) return [];
        if (nodeTemplate.selectableNodeIds?.length) return [...nodeTemplate.selectableNodeIds];
        if (nodeTemplate.nodes?.length) return nodeTemplate.nodes.map((node) => node.id);
        if (nodeTemplate.presentNode) return [nodeTemplate.presentNode];
        return [];
    }

    function getDefaultPresentNodeId(nodeTemplate) {
        if (!nodeTemplate) return null;
        return nodeTemplate.presentNode || getSelectableNodeIds(nodeTemplate)[0] || null;
    }

    function getNodeDefinitionByIndex(nodeTemplate, nodeId) {
        return nodeTemplate?.nodes?.find((node) => node.id === nodeId) || null;
    }

    function normalizeNodeTypeKey(ctx, value, fallback = 'vision') {
        if (ctx && typeof ctx.normalizeResourceKey === 'function') {
            return ctx.normalizeResourceKey(value, fallback);
        }
        const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
        const aliases = { contract: 'asset', event: 'vision' };
        const key = aliases[raw] || raw;
        return ['combat', 'rest', 'asset', 'vision'].includes(key) ? key : fallback;
    }

    function getNodeTemplate(ctx, nodeIndex = ctx.currentNodeIndex) {
        return ctx.campaignNodes.find((cNode) => cNode.nodeIndex === nodeIndex) || null;
    }

    function getNodeIdsByIndex(ctx, nodeIndex) {
        return getSelectableNodeIds(getNodeTemplate(ctx, nodeIndex));
    }

    function getNodeIndex(ctx, nodeId) {
        const ownerNodeIndex = ctx.campaignNodes.find((cNode) => getNodeIdsByIndex(ctx, cNode.nodeIndex).includes(nodeId));
        return ownerNodeIndex?.nodeIndex ?? -1;
    }

    function getNodeCatalogEntry(ctx, nodeId) {
        const ownerNodeIndex = ctx.campaignNodes.find((cNode) => getSelectableNodeIds(cNode).includes(nodeId));
        const nodeDefinition = getNodeDefinitionByIndex(ownerNodeIndex, nodeId);
        if (!nodeDefinition) return null;
        const nodeTypeKey = normalizeNodeTypeKey(ctx, nodeDefinition.key, 'vision');
        const classList = [`type-${nodeTypeKey}`];
        const laneKey = typeof nodeDefinition.lane === 'string' ? nodeDefinition.lane.trim().toLowerCase() : '';
        if (nodeDefinition.isBranch) classList.push('node-branch');
        if (laneKey) classList.push(`lane-${laneKey}`);
        if (ctx.hasFixedPhaseMarkers(nodeId)) classList.push('node-has-fixed-phase');
        return {
            id: nodeDefinition.id,
            label: nodeDefinition.label,
            sublabel: nodeDefinition.sublabel,
            classes: classList,
            lane: laneKey,
            mainlineLanes: Array.isArray(nodeDefinition.mainlineLanes)
                ? nodeDefinition.mainlineLanes
                    .map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
                    .filter((value, index, list) => value && list.indexOf(value) === index)
                : [],
            hasFixedPhaseMarkers: ctx.hasFixedPhaseMarkers(nodeId)
        };
    }

    function getPresentNodeTransition(ctx, nodeId) {
        const nodeCatalog = ctx.frontendSnapshot?.nodeCatalog;
        const runtimeNode = nodeCatalog && typeof nodeCatalog === 'object'
            ? nodeCatalog[nodeId]
            : null;
        const next = runtimeNode && typeof runtimeNode.next === 'object' ? runtimeNode.next : null;
        const mode = typeof next?.mode === 'string' ? next.mode.trim().toLowerCase() : 'none';
        const forcedNodeId = typeof next?.nodeId === 'string' ? next.nodeId.trim() : null;
        return {
            mode: mode || 'none',
            forcedNodeId: forcedNodeId || null
        };
    }

    function getNodeTypeKey(ctx, nodeId) {
        const node = getNodeCatalogEntry(ctx, nodeId);
        if (!node) return 'vision';
        const typeClass = node.classes.find((className) => className.startsWith('type-'));
        return normalizeNodeTypeKey(ctx, typeClass ? typeClass.replace('type-', '') : 'vision', 'vision');
    }

    function getMapColumns(ctx) {
        return ctx.campaignNodes.map((cNode) => ({
            lineId: `grid-node${cNode.nodeIndex}`,
            lineClass: 'grid-col-line',
            nodeIds: getNodeIdsByIndex(ctx, cNode.nodeIndex)
        }));
    }

    function getMapNodes(ctx) {
        return getMapColumns(ctx)
            .flatMap((column) => column.nodeIds)
            .map((nodeId) => getNodeCatalogEntry(ctx, nodeId))
            .filter(Boolean);
    }

    function getMapTopology(ctx) {
        const snapshotTopology = ctx.frontendSnapshot?.topology;
        if (Array.isArray(snapshotTopology) && snapshotTopology.length) {
            return snapshotTopology
                .filter((entry) => entry && typeof entry.from === 'string' && typeof entry.to === 'string')
                .map((entry) => ({ from: entry.from, to: entry.to }));
        }
        const topology = [];
        for (let nodeIndex = 1; nodeIndex < ctx.campaignTotalNodes; nodeIndex += 1) {
            const fromNodeIds = getNodeIdsByIndex(ctx, nodeIndex);
            const toNodeIds = getNodeIdsByIndex(ctx, nodeIndex + 1);
            fromNodeIds.forEach((fromId) => {
                toNodeIds.forEach((toId) => {
                    topology.push({ from: fromId, to: toId });
                });
            });
        }
        return topology;
    }

    function getChosenNodeIdByIndex(ctx, nodeIndex, currentPresentNodeId = ctx.currentNodeId) {
        const nodeTemplate = getNodeTemplate(ctx, nodeIndex);
        if (!nodeTemplate) return null;
        if (nodeIndex < ctx.currentNodeIndex) {
            return ctx.routeHistory[nodeIndex - 1] || getDefaultPresentNodeId(nodeTemplate);
        }
        if (nodeIndex === ctx.currentNodeIndex) {
            if (getSelectableNodeIds(nodeTemplate).includes(currentPresentNodeId)) return currentPresentNodeId;
            return getDefaultPresentNodeId(nodeTemplate);
        }
        if (nodeTemplate.template === 'fixed') {
            return getDefaultPresentNodeId(nodeTemplate);
        }
        return null;
    }

    function getDerivedPathNodeIds(ctx, nodeIndex, presentNodeId) {
        const pathNodeIds = [];
        for (let index = 1; index <= nodeIndex; index += 1) {
            const chosenNodeId = getChosenNodeIdByIndex(ctx, index, presentNodeId);
            if (chosenNodeId) pathNodeIds.push(chosenNodeId);
        }
        return pathNodeIds.filter((nodeId, index, list) => list.indexOf(nodeId) === index);
    }

    function getDerivedDeadNodeIds(ctx, nodeIndex, presentNodeId) {
        const deadNodeIds = new Set();

        ctx.campaignNodes
            .filter((cNode) => cNode.nodeIndex <= nodeIndex)
            .forEach((cNode) => {
                (cNode.deadNodes || []).forEach((nodeId) => deadNodeIds.add(nodeId));
                const nodeIdsAtIndex = getSelectableNodeIds(cNode);
                if (nodeIdsAtIndex.length <= 1) return;
                const chosenNodeId = cNode.nodeIndex === nodeIndex ? presentNodeId : ctx.routeHistory[cNode.nodeIndex - 1];
                nodeIdsAtIndex.forEach((nodeId) => {
                    if (nodeId !== chosenNodeId) deadNodeIds.add(nodeId);
                });
            });

        deadNodeIds.delete(presentNodeId);
        return Array.from(deadNodeIds);
    }

    function getDerivedFutureNodeIds(ctx, nodeIndex, presentNodeId, deadNodeIds) {
        const deadNodeIdSet = new Set(deadNodeIds);
        const futureNodeIds = [];
        ctx.campaignNodes
            .filter((cNode) => cNode.nodeIndex > nodeIndex)
            .forEach((cNode) => {
                getNodeIdsByIndex(ctx, cNode.nodeIndex).forEach((nodeId) => {
                    if (nodeId === presentNodeId) return;
                    if (deadNodeIdSet.has(nodeId)) return;
                    futureNodeIds.push(nodeId);
                });
            });
        return futureNodeIds.filter((nodeId, index, list) => list.indexOf(nodeId) === index);
    }

    function getCurrentNodeData(ctx) {
        const nodeTemplate = getNodeTemplate(ctx, ctx.currentNodeIndex);
        const selectableNodeIds = getSelectableNodeIds(nodeTemplate);
        const presentNodeId = selectableNodeIds.includes(ctx.currentNodeId)
            ? ctx.currentNodeId
            : getDefaultPresentNodeId(nodeTemplate) || ctx.currentNodeId;
        const node = getNodeCatalogEntry(ctx, presentNodeId);
        const typeKey = getNodeTypeKey(ctx, presentNodeId);
        const label = nodeTemplate?.label || `NODE ${String(ctx.currentNodeIndex).padStart(2, '0')}`;
        const deadNodeIds = getDerivedDeadNodeIds(ctx, ctx.currentNodeIndex, presentNodeId);
        const presentTransition = getPresentNodeTransition(ctx, presentNodeId);
        const snapshotLimited = Array.isArray(ctx.frontendSnapshot?.currentLimitedRewards)
            ? ctx.frontendSnapshot.currentLimitedRewards
            : null;
        const limitedRewards = snapshotLimited?.length
            ? snapshotLimited
            : (nodeTemplate?.limited?.length ? nodeTemplate.limited : ctx.getDefaultLimitedRewardsForNode(presentNodeId));
        return {
            nodeIndex: ctx.currentNodeIndex,
            label,
            template: nodeTemplate?.template || 'fixed',
            title: nodeTemplate?.title || node?.sublabel || 'UNASSIGNED NODE',
            subtitle: nodeTemplate?.subtitle || `${ctx.resourceLabelMap[typeKey]}点 · 当日排程节点`,
            mapFocus: nodeTemplate?.template === 'fixed'
                ? (nodeTemplate?.mapFocus || presentNodeId)
                : presentNodeId,
            presentNode: presentNodeId,
            selectableNodeIds,
            nextRouteMode: presentTransition.mode || nodeTemplate?.nextRouteMode || 'none',
            nextForcedNodeId: presentTransition.forcedNodeId || nodeTemplate?.nextForcedNodeId || null,
            pathNodes: getDerivedPathNodeIds(ctx, ctx.currentNodeIndex, presentNodeId),
            futureNodes: getDerivedFutureNodeIds(ctx, ctx.currentNodeIndex, presentNodeId, deadNodeIds),
            deadNodes: deadNodeIds,
            limited: limitedRewards.map((reward) => ({
                ...reward,
                title: reward.title || `限定·${ctx.resourceLabelMap[reward.key]}点`,
                sublabel: reward.sublabel || `NODE-BOUND ${ctx.resourceTypeMap[reward.key]}`
            }))
        };
    }

    function getRouteOptions(ctx) {
        const currentNodeData = getCurrentNodeData(ctx);
        const nextNodeTemplate = getNodeTemplate(ctx, ctx.currentNodeIndex + 1);
        const snapshotRouteOptions = ctx.frontendSnapshot?.routeOptions;
        if (!nextNodeTemplate) return [];
        if (ctx.frontendSnapshot?.routeMode === 'jump' && Array.isArray(snapshotRouteOptions) && snapshotRouteOptions.length) {
            return snapshotRouteOptions
                .filter((nodeId) => typeof nodeId === 'string' && nodeId.trim())
                .map((nodeId) => nodeId.trim());
        }
        if (currentNodeData.nextRouteMode === 'none') return [];

        const outgoingNodeIds = getMapTopology(ctx)
            .filter((conn) => conn.from === currentNodeData.presentNode)
            .map((conn) => conn.to)
            .filter((nodeId) => nodeId !== currentNodeData.presentNode);
        if (!outgoingNodeIds.length) return [];

        if (currentNodeData.nextRouteMode === 'forced') {
            const forcedNodeId = currentNodeData.nextForcedNodeId;
            return forcedNodeId && outgoingNodeIds.includes(forcedNodeId) ? [forcedNodeId] : [];
        }

        if (Array.isArray(snapshotRouteOptions) && snapshotRouteOptions.length) {
            const normalizedSnapshotOptions = snapshotRouteOptions
                .filter((nodeId) => typeof nodeId === 'string' && nodeId.trim())
                .map((nodeId) => nodeId.trim());
            const filteredSnapshotOptions = normalizedSnapshotOptions.filter((nodeId) => outgoingNodeIds.includes(nodeId));
            if (filteredSnapshotOptions.length) return filteredSnapshotOptions;
        }

        const allowedNodeIds = getSelectableNodeIds(nextNodeTemplate);
        return outgoingNodeIds.filter((nodeId) => allowedNodeIds.includes(nodeId));
    }

    global.ACE0OverviewCampaignRuntime = Object.freeze({
        getNodeDefinitionByIndex,
        getSelectableNodeIds,
        getDefaultPresentNodeId,
        getNodeCatalogEntry,
        getNodeTypeKey,
        getNodeTemplate,
        getNodeIdsByIndex,
        getNodeIndex,
        getMapColumns,
        getMapNodes,
        getMapTopology,
        getChosenNodeIdByIndex,
        getDerivedPathNodeIds,
        getDerivedFutureNodeIds,
        getDerivedDeadNodeIds,
        getCurrentNodeData,
        getRouteOptions
    });
})(typeof window !== 'undefined' ? window : globalThis);
