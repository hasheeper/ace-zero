(function(global) {
  'use strict';

  var PROFILE_STORAGE_KEY = 'acezero:tutorial-profile:texas-holdem';
  var COURSE_STORAGE_PREFIX = 'acezero:tutorial-course:texas-holdem:';

  function safeLocalStorageGet(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (error) {
      return null;
    }
  }

  function isRelativeBarePath(path) {
    return path.charAt(0) !== '/' &&
      path.indexOf('./') !== 0 &&
      path.indexOf('../') !== 0;
  }

  function buildTutorialPathCandidates(tutorialPath) {
    var candidates = [tutorialPath];
    if (isRelativeBarePath(tutorialPath)) {
      candidates.push('../../' + tutorialPath);
      candidates.push('../../../' + tutorialPath);
    }
    return candidates;
  }

  function pickTutorialIndexProfile(indexConfig, preferredId) {
    var profiles = Array.isArray(indexConfig && indexConfig.profiles) ? indexConfig.profiles : [];
    if (!profiles.length) return null;

    var rememberedId = safeLocalStorageGet(PROFILE_STORAGE_KEY);
    var targetId = preferredId || rememberedId || null;
    if (targetId) {
      var exact = profiles.find(function(profile) {
        return profile && profile.id === targetId;
      });
      if (exact) return exact;
    }

    var novice = profiles.find(function(profile) {
      return profile && /novice|newbie|intro/i.test(String(profile.id || ''));
    });
    return novice || profiles[0] || null;
  }

  function pickTutorialIndexCourse(profile, preferredId) {
    var courses = Array.isArray(profile && profile.courses) ? profile.courses : [];
    if (!courses.length) {
      if (profile && profile.configPath) {
        return {
          id: profile.id || 'default-course',
          configPath: profile.configPath
        };
      }
      return null;
    }

    var rememberedId = profile && profile.id
      ? safeLocalStorageGet(COURSE_STORAGE_PREFIX + profile.id)
      : null;
    var targetId = preferredId || rememberedId || null;
    if (targetId) {
      var exact = courses.find(function(course) {
        return course && course.id === targetId;
      });
      if (exact) return exact;
    }

    return courses[0] || null;
  }

  async function resolveTutorialConfig(config, options) {
    options = options || {};
    if (!config || !config.tutorialConfigPath || config._tutorialResolved) return config;

    var tutorialPath = String(config.tutorialConfigPath || '').trim();
    if (!tutorialPath) return config;

    var fetcher = typeof options.fetch === 'function'
      ? options.fetch
      : global.fetch;
    if (typeof fetcher !== 'function') return config;

    var candidates = buildTutorialPathCandidates(tutorialPath);
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var resp = await fetcher(candidates[i]);
        if (!resp.ok) continue;
        var tutorialConfig = await resp.json();
        if (tutorialConfig && tutorialConfig.sessionMode === 'tutorial-index' && Array.isArray(tutorialConfig.profiles)) {
          var selectedProfile = pickTutorialIndexProfile(tutorialConfig, config.tutorialProfile || null);
          var selectedCourse = pickTutorialIndexCourse(selectedProfile, config.tutorialCourse || null);
          var selectedPath = selectedCourse && selectedCourse.configPath;
          if (!selectedProfile || !selectedPath) {
            return Object.assign({}, config, {
              _tutorialResolved: true
            });
          }
          return resolveTutorialConfig(Object.assign({}, config, {
            sessionMode: 'tutorial',
            tutorialProfile: selectedProfile.id || null,
            tutorialCourse: selectedCourse && selectedCourse.id || null,
            tutorialConfigPath: selectedPath,
            tutorialLauncherPath: tutorialPath
          }), options);
        }
        return Object.assign({}, config, tutorialConfig, {
          tutorialLauncher: {
            profile: config.tutorialProfile || null,
            course: config.tutorialCourse || null,
            path: config.tutorialLauncherPath || tutorialPath
          },
          _tutorialResolved: true
        });
      } catch (error) {
        // Try the next candidate path.
      }
    }

    return config;
  }

  global.AceTexasTutorialConfigLoader = Object.freeze({
    PROFILE_STORAGE_KEY: PROFILE_STORAGE_KEY,
    COURSE_STORAGE_PREFIX: COURSE_STORAGE_PREFIX,
    buildTutorialPathCandidates: buildTutorialPathCandidates,
    pickProfile: pickTutorialIndexProfile,
    pickCourse: pickTutorialIndexCourse,
    resolve: resolveTutorialConfig
  });
})(window);
