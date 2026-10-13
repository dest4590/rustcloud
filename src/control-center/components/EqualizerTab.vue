<template>
  <div class="rc-equalizer-tab">
    <div class="rc-main-toggle-card" :class="{ 'is-active': config.enabled }">
      <div class="rc-toggle-left">
        <div class="rc-eq-icon-wrap">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
            />
          </svg>
        </div>
        <div>
          <div class="rc-toggle-title">audio processing</div>
          <div class="rc-toggle-sub">
            {{
              !isRustAudio
                ? "requires rust native audio player"
                : isDrmFallback
                  ? "Track is encrypted, playing without DRM"
                  : config.enabled
                    ? "enabled"
                    : "disabled"
            }}
          </div>
        </div>
      </div>
      <div
        class="rc-custom-switch"
        :class="{ active: config.enabled, disabled: !isRustAudio }"
        role="switch"
        :aria-checked="config.enabled"
        tabindex="0"
        @click="onToggleSwitch"
        @keydown.space.prevent="onToggleSwitch"
        @keydown.enter.prevent="onToggleSwitch"
      >
        <div class="rc-switch-track">
          <div class="rc-switch-thumb"></div>
        </div>
      </div>
    </div>

    <div class="rc-subtabs-nav">
      <button
        class="rc-subtab-btn"
        :class="{ active: subTab === 'eq' }"
        @click="subTab = 'eq'"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />
        </svg>
        <span>equalizer & bass</span>
      </button>
      <button
        class="rc-subtab-btn"
        :class="{ active: subTab === 'effects' }"
        @click="subTab = 'effects'"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path
            d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"
          />
        </svg>
        <span>effects</span>
        <span class="rc-active-dot" v-if="hasActiveEffects"></span>
      </button>
    </div>

    <div class="rc-card-box">
      <div class="rc-preset-header">
        <div class="rc-section-title-wrap">
          <span class="rc-section-title">presets</span>
          <span class="rc-preset-badge" v-if="activePresetLabel">{{
            activePresetLabel.toLowerCase()
          }}</span>
        </div>
        <button class="rc-reset-btn" @click="resetAllToDefault" title="reset">
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          reset
        </button>
      </div>

      <div class="rc-preset-grid">
        <button
          v-for="(preset, key) in DSP_PRESETS"
          :key="key"
          class="rc-preset-card"
          :class="{ active: activePreset === key }"
          @click="applyPreset(key)"
        >
          <div class="rc-preset-indicator"></div>
          <div class="rc-preset-name">{{ preset.label.toLowerCase() }}</div>
          <div class="rc-preset-desc">
            {{ preset.description.toLowerCase() }}
          </div>
        </button>
      </div>
    </div>

    <template v-if="subTab === 'eq'">
      <div class="rc-card-box rc-graph-card">
        <div class="rc-graph-header">
          <div class="rc-graph-title-group">
            <span class="rc-section-title">frequency response</span>
            <span class="rc-graph-hint">drag points to sculpt</span>
          </div>
          <div class="rc-graph-actions">
            <button
              class="rc-mini-action-btn"
              @click="applyCurveAction('flat')"
              title="flatten curve"
            >
              flatten
            </button>
            <button
              class="rc-mini-action-btn"
              @click="applyCurveAction('smooth')"
              title="smooth curve"
            >
              smooth
            </button>
          </div>
        </div>

        <div class="rc-curve-container">
          <svg
            ref="svgGraphRef"
            class="rc-curve-svg"
            viewBox="0 0 400 92"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="rc-curve-fill-grad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stop-color="#ff5500" stop-opacity="0.32" />
                <stop offset="60%" stop-color="#ff5500" stop-opacity="0.08" />
                <stop offset="100%" stop-color="#ff5500" stop-opacity="0.0" />
              </linearGradient>
            </defs>

            <line
              x1="0"
              y1="10"
              x2="400"
              y2="10"
              class="rc-grid-line rc-grid-dashed"
            />
            <line
              x1="0"
              y1="28"
              x2="400"
              y2="28"
              class="rc-grid-line rc-grid-dashed"
            />
            <line
              x1="0"
              y1="46"
              x2="400"
              y2="46"
              class="rc-grid-line rc-grid-zero"
            />
            <line
              x1="0"
              y1="64"
              x2="400"
              y2="64"
              class="rc-grid-line rc-grid-dashed"
            />
            <line
              x1="0"
              y1="82"
              x2="400"
              y2="82"
              class="rc-grid-line rc-grid-dashed"
            />

            <line
              v-for="nodeX in nodeXCoords"
              :key="nodeX"
              :x1="nodeX"
              y1="0"
              :x2="nodeX"
              y2="92"
              class="rc-grid-line rc-grid-vert"
            />

            <text x="4" y="14" class="rc-svg-label">+12</text>
            <text x="4" y="49" class="rc-svg-label">0dB</text>
            <text x="4" y="85" class="rc-svg-label">-12</text>

            <path :d="curveAreaSvgPath" fill="url(#rc-curve-fill-grad)" />

            <path :d="curveSvgPath" fill="none" class="rc-curve-stroke" />

            <g
              v-for="(band, i) in bandFrequencies"
              :key="band.key"
              class="rc-curve-node-group"
              :class="{
                active: activeDragNode === band.key,
                hovered: hoveredBand === band.key,
              }"
              @pointerdown="startNodeDrag(band.key, $event)"
              @pointermove="onNodePointerMove(band.key, $event)"
              @pointerup="stopNodeDrag(band.key, $event)"
              @pointercancel="stopNodeDrag(band.key, $event)"
              @mouseenter="hoveredBand = band.key"
              @mouseleave="hoveredBand === band.key && (hoveredBand = null)"
              @dblclick="resetBand(band.key)"
            >
              <circle
                :cx="nodeXCoords[i]"
                :cy="getYForGain(config.bands[band.key])"
                r="12"
                fill="transparent"
                class="rc-node-hitbox"
              />
              <rect
                :x="nodeXCoords[i] - 4"
                :y="getYForGain(config.bands[band.key]) - 4"
                width="8"
                height="8"
                class="rc-curve-node"
                :class="{
                  positive: config.bands[band.key] > 0,
                  negative: config.bands[band.key] < 0,
                  zero: config.bands[band.key] === 0,
                }"
              />
            </g>
          </svg>
        </div>

        <div class="rc-sculpt-bar">
          <button class="rc-sculpt-btn" @click="applyCurveAction('flat')">
            flat
          </button>
          <button class="rc-sculpt-btn" @click="applyCurveAction('bass')">
            bass +
          </button>
          <button class="rc-sculpt-btn" @click="applyCurveAction('vshape')">
            v-shape
          </button>
          <button class="rc-sculpt-btn" @click="applyCurveAction('vocal')">
            vocal +
          </button>
          <button class="rc-sculpt-btn" @click="applyCurveAction('treble')">
            treble +
          </button>
          <button class="rc-sculpt-btn" @click="applyCurveAction('invert')">
            invert
          </button>
        </div>
      </div>

      <div class="rc-sliders-card">
        <div class="rc-eq-header-line">
          <div class="rc-title-with-badge">
            <span class="rc-section-title">10-band equalizer</span>
            <span class="rc-range-hint">±12.0 db</span>
          </div>
          <div class="rc-fader-controls-tip">double-click to reset</div>
        </div>

        <div class="rc-bands-container">
          <div
            v-for="band in bandFrequencies"
            :key="band.key"
            class="rc-eq-band"
            :class="{
              'is-dragging':
                activeDragFader === band.key || activeDragNode === band.key,
              'is-hovered': hoveredBand === band.key,
            }"
            @mouseenter="hoveredBand = band.key"
            @mouseleave="hoveredBand === band.key && (hoveredBand = null)"
          >
            <button
              class="rc-band-val-btn"
              :class="{
                positive: config.bands[band.key] > 0,
                negative: config.bands[band.key] < 0,
                zero: config.bands[band.key] === 0,
              }"
              @click="resetBand(band.key)"
              title="click to reset to 0dB"
            >
              {{ formatBandVal(config.bands[band.key]) }}
            </button>

            <div
              class="rc-fader-track"
              role="slider"
              :aria-label="band.label + 'Hz'"
              :aria-valuemin="-12"
              :aria-valuemax="12"
              :aria-valuenow="config.bands[band.key]"
              tabindex="0"
              @pointerdown="startFaderDrag(band.key, $event)"
              @pointermove="onFaderPointerMove(band.key, $event)"
              @pointerup="stopFaderDrag(band.key, $event)"
              @pointercancel="stopFaderDrag(band.key, $event)"
              @dblclick="resetBand(band.key)"
              @keydown.up.prevent="stepBand(band.key, 0.5)"
              @keydown.down.prevent="stepBand(band.key, -0.5)"
            >
              <div class="rc-fader-zero-line"></div>

              <div
                v-if="config.bands[band.key] > 0"
                class="rc-fader-fill positive"
                :style="{
                  bottom: '50%',
                  height: `${(config.bands[band.key] / 12) * 50}%`,
                }"
              ></div>
              <div
                v-else-if="config.bands[band.key] < 0"
                class="rc-fader-fill negative"
                :style="{
                  top: '50%',
                  height: `${(-config.bands[band.key] / 12) * 50}%`,
                }"
              ></div>

              <div
                class="rc-fader-thumb"
                :style="{
                  top: `calc(${((12 - config.bands[band.key]) / 24) * 100}% - 7px)`,
                }"
              >
                <div class="rc-fader-thumb-groove"></div>
              </div>
            </div>

            <div class="rc-band-label-wrap">
              <span class="rc-band-label">{{ band.label.toLowerCase() }}</span>
              <span class="rc-band-subtag">{{ band.tag }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="rc-card-box">
        <div class="rc-bass-header">
          <div class="rc-bass-title-group">
            <span class="rc-section-title">bass boost</span>
            <span class="rc-freq-tag">80hz analog drive</span>
          </div>
          <div class="rc-bass-pill" :class="{ nonzero: config.bassBoost > 0 }">
            {{ config.bassBoost }}%
          </div>
        </div>

        <div
          class="rc-custom-slider-track"
          role="slider"
          aria-label="bass boost"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="config.bassBoost"
          tabindex="0"
          @pointerdown="startSliderDrag('bassBoost', 0, 100, 1, $event)"
          @pointermove="onSliderPointerMove('bassBoost', 0, 100, 1, $event)"
          @pointerup="stopSliderDrag('bassBoost', $event)"
          @pointercancel="stopSliderDrag('bassBoost', $event)"
          @dblclick="
            config.bassBoost = 0;
            save();
          "
          @keydown.left.prevent="stepParam('bassBoost', 0, 100, -5)"
          @keydown.right.prevent="stepParam('bassBoost', 0, 100, 5)"
        >
          <div
            class="rc-custom-slider-fill"
            :style="{ width: `${config.bassBoost}%` }"
          ></div>
          <div
            class="rc-custom-slider-thumb"
            :style="{ left: `calc(${config.bassBoost}% - 6px)` }"
          ></div>
        </div>

        <div class="rc-quick-row">
          <button
            class="rc-quick-btn"
            :class="{ active: config.bassBoost === 0 }"
            @click="
              config.bassBoost = 0;
              onBassChange();
            "
          >
            0% off
          </button>
          <button
            class="rc-quick-btn"
            :class="{ active: config.bassBoost === 25 }"
            @click="
              config.bassBoost = 25;
              onBassChange();
            "
          >
            25% punch
          </button>
          <button
            class="rc-quick-btn"
            :class="{ active: config.bassBoost === 50 }"
            @click="
              config.bassBoost = 50;
              onBassChange();
            "
          >
            50% heavy
          </button>
          <button
            class="rc-quick-btn"
            :class="{ active: config.bassBoost === 80 }"
            @click="
              config.bassBoost = 80;
              onBassChange();
            "
          >
            80% sub drive
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="subTab === 'effects'">
      <div class="rc-card-box">
        <div class="rc-section-header-compact">
          <span class="rc-section-title">stereo width & spatialization</span>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <span class="rc-control-name">width</span>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.stereoWidth !== 100 }"
            >
              {{ config.stereoWidth }}%
              <span class="rc-sublabel">{{
                getWidthLabel(config.stereoWidth)
              }}</span>
            </span>
          </div>

          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="stereo width"
            :aria-valuemin="0"
            :aria-valuemax="200"
            :aria-valuenow="config.stereoWidth"
            tabindex="0"
            @pointerdown="startSliderDrag('stereoWidth', 0, 200, 1, $event)"
            @pointermove="onSliderPointerMove('stereoWidth', 0, 200, 1, $event)"
            @pointerup="stopSliderDrag('stereoWidth', $event)"
            @pointercancel="stopSliderDrag('stereoWidth', $event)"
            @dblclick="
              config.stereoWidth = 100;
              onEffectParamChange();
            "
          >
            <div class="rc-slider-center-tick" style="left: 50%"></div>
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${(config.stereoWidth / 200) * 100}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{
                left: `calc(${(config.stereoWidth / 200) * 100}% - 6px)`,
              }"
            ></div>
          </div>

          <div class="rc-scale-labels">
            <span>mono (0%)</span>
            <span>normal (100%)</span>
            <span>wide (200%)</span>
          </div>
        </div>

        <div class="rc-toggle-row">
          <div class="rc-toggle-row-text">
            <div class="rc-toggle-row-title">crossfeed</div>
            <div class="rc-toggle-row-desc">
              blends channels for natural headphone imaging
            </div>
          </div>
          <div
            class="rc-custom-switch"
            :class="{ active: config.crossfeed }"
            role="switch"
            :aria-checked="config.crossfeed"
            tabindex="0"
            @click="
              config.crossfeed = !config.crossfeed;
              onEffectParamChange();
            "
            @keydown.space.prevent="
              config.crossfeed = !config.crossfeed;
              onEffectParamChange();
            "
            @keydown.enter.prevent="
              config.crossfeed = !config.crossfeed;
              onEffectParamChange();
            "
          >
            <div class="rc-switch-track">
              <div class="rc-switch-thumb"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="rc-card-box">
        <div class="rc-section-header-compact">
          <span class="rc-section-title">analog tone</span>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <div class="rc-meta-left">
              <span class="rc-control-name">warmth</span>
              <span class="rc-freq-tag">tube saturation</span>
            </div>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.tubeWarmth > 0 }"
            >
              {{ config.tubeWarmth }}%
            </span>
          </div>
          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="tube warmth"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="config.tubeWarmth"
            tabindex="0"
            @pointerdown="startSliderDrag('tubeWarmth', 0, 100, 1, $event)"
            @pointermove="onSliderPointerMove('tubeWarmth', 0, 100, 1, $event)"
            @pointerup="stopSliderDrag('tubeWarmth', $event)"
            @pointercancel="stopSliderDrag('tubeWarmth', $event)"
            @dblclick="
              config.tubeWarmth = 0;
              onEffectParamChange();
            "
          >
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${config.tubeWarmth}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{ left: `calc(${config.tubeWarmth}% - 6px)` }"
            ></div>
          </div>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <div class="rc-meta-left">
              <span class="rc-control-name">clarity</span>
              <span class="rc-freq-tag">9.5khz air</span>
            </div>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.clarity > 0 }"
            >
              {{ config.clarity }}%
            </span>
          </div>
          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="clarity"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="config.clarity"
            tabindex="0"
            @pointerdown="startSliderDrag('clarity', 0, 100, 1, $event)"
            @pointermove="onSliderPointerMove('clarity', 0, 100, 1, $event)"
            @pointerup="stopSliderDrag('clarity', $event)"
            @pointercancel="stopSliderDrag('clarity', $event)"
            @dblclick="
              config.clarity = 0;
              onEffectParamChange();
            "
          >
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${config.clarity}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{ left: `calc(${config.clarity}% - 6px)` }"
            ></div>
          </div>
        </div>
      </div>

      <div class="rc-card-box">
        <div class="rc-section-header-compact">
          <span class="rc-section-title">reverb</span>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <div class="rc-meta-left">
              <span class="rc-control-name">mix</span>
            </div>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.reverbWet > 0 }"
            >
              {{ config.reverbWet }}%
            </span>
          </div>
          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="reverb mix"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="config.reverbWet"
            tabindex="0"
            @pointerdown="startSliderDrag('reverbWet', 0, 100, 1, $event)"
            @pointermove="onSliderPointerMove('reverbWet', 0, 100, 1, $event)"
            @pointerup="stopSliderDrag('reverbWet', $event)"
            @pointercancel="stopSliderDrag('reverbWet', $event)"
            @dblclick="
              config.reverbWet = 0;
              onEffectParamChange();
            "
          >
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${config.reverbWet}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{ left: `calc(${config.reverbWet}% - 6px)` }"
            ></div>
          </div>
        </div>

        <div class="rc-dual-controls">
          <div class="rc-dual-col">
            <div class="rc-control-meta">
              <span class="rc-control-name">room size</span>
              <span class="rc-value-badge-mini">{{ config.reverbSize }}%</span>
            </div>
            <div
              class="rc-custom-slider-track mini"
              tabindex="0"
              @pointerdown="startSliderDrag('reverbSize', 0, 100, 1, $event)"
              @pointermove="
                onSliderPointerMove('reverbSize', 0, 100, 1, $event)
              "
              @pointerup="stopSliderDrag('reverbSize', $event)"
              @pointercancel="stopSliderDrag('reverbSize', $event)"
              @dblclick="
                config.reverbSize = 50;
                onEffectParamChange();
              "
            >
              <div
                class="rc-custom-slider-fill"
                :style="{ width: `${config.reverbSize}%` }"
              ></div>
              <div
                class="rc-custom-slider-thumb"
                :style="{ left: `calc(${config.reverbSize}% - 5px)` }"
              ></div>
            </div>
          </div>

          <div class="rc-dual-col">
            <div class="rc-control-meta">
              <span class="rc-control-name">damping</span>
              <span class="rc-value-badge-mini">{{ config.reverbDamp }}%</span>
            </div>
            <div
              class="rc-custom-slider-track mini"
              tabindex="0"
              @pointerdown="startSliderDrag('reverbDamp', 0, 100, 1, $event)"
              @pointermove="
                onSliderPointerMove('reverbDamp', 0, 100, 1, $event)
              "
              @pointerup="stopSliderDrag('reverbDamp', $event)"
              @pointercancel="stopSliderDrag('reverbDamp', $event)"
              @dblclick="
                config.reverbDamp = 40;
                onEffectParamChange();
              "
            >
              <div
                class="rc-custom-slider-fill"
                :style="{ width: `${config.reverbDamp}%` }"
              ></div>
              <div
                class="rc-custom-slider-thumb"
                :style="{ left: `calc(${config.reverbDamp}% - 5px)` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="rc-card-box">
        <div class="rc-section-header-compact">
          <span class="rc-section-title">speed & pitch</span>
          <span class="rc-freq-tag">slowed / nightcore</span>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <div class="rc-meta-left">
              <span class="rc-control-name">speed</span>
            </div>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.playbackSpeed !== 1.0 }"
            >
              {{ config.playbackSpeed.toFixed(2) }}x
            </span>
          </div>

          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="playback speed"
            :aria-valuemin="0.5"
            :aria-valuemax="2.0"
            :aria-valuenow="config.playbackSpeed"
            tabindex="0"
            @pointerdown="
              startSliderDrag('playbackSpeed', 0.5, 2.0, 0.05, $event)
            "
            @pointermove="
              onSliderPointerMove('playbackSpeed', 0.5, 2.0, 0.05, $event)
            "
            @pointerup="stopSliderDrag('playbackSpeed', $event)"
            @pointercancel="stopSliderDrag('playbackSpeed', $event)"
            @dblclick="
              config.playbackSpeed = 1.0;
              onEffectParamChange();
            "
          >
            <div class="rc-slider-center-tick" style="left: 33.33%"></div>
            <div
              class="rc-custom-slider-fill"
              :style="{
                width: `${((config.playbackSpeed - 0.5) / 1.5) * 100}%`,
              }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{
                left: `calc(${((config.playbackSpeed - 0.5) / 1.5) * 100}% - 6px)`,
              }"
            ></div>
          </div>

          <div class="rc-quick-row">
            <button
              class="rc-quick-btn"
              :class="{ active: config.playbackSpeed === 0.85 }"
              @click="
                config.playbackSpeed = 0.85;
                onEffectParamChange();
              "
            >
              0.85x slowed
            </button>
            <button
              class="rc-quick-btn"
              :class="{ active: config.playbackSpeed === 1.0 }"
              @click="
                config.playbackSpeed = 1.0;
                onEffectParamChange();
              "
            >
              1.0x normal
            </button>
            <button
              class="rc-quick-btn"
              :class="{ active: config.playbackSpeed === 1.25 }"
              @click="
                config.playbackSpeed = 1.25;
                onEffectParamChange();
              "
            >
              1.25x nightcore
            </button>
          </div>
        </div>

        <div class="rc-effect-control">
          <div class="rc-control-meta">
            <div class="rc-meta-left">
              <span class="rc-control-name">pitch shift</span>
            </div>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.pitchShift !== 0 }"
            >
              {{
                config.pitchShift > 0
                  ? `+${config.pitchShift}`
                  : config.pitchShift
              }}
              st
            </span>
          </div>

          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="pitch shift"
            :aria-valuemin="-12"
            :aria-valuemax="12"
            :aria-valuenow="config.pitchShift"
            tabindex="0"
            @pointerdown="startSliderDrag('pitchShift', -12, 12, 1, $event)"
            @pointermove="onSliderPointerMove('pitchShift', -12, 12, 1, $event)"
            @pointerup="stopSliderDrag('pitchShift', $event)"
            @pointercancel="stopSliderDrag('pitchShift', $event)"
            @dblclick="
              config.pitchShift = 0;
              onEffectParamChange();
            "
          >
            <div class="rc-slider-center-tick" style="left: 50%"></div>
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${((config.pitchShift + 12) / 24) * 100}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{
                left: `calc(${((config.pitchShift + 12) / 24) * 100}% - 6px)`,
              }"
            ></div>
          </div>

          <div class="rc-quick-row">
            <button
              class="rc-quick-btn"
              :class="{ active: config.pitchShift === -2 }"
              @click="
                config.pitchShift = -2;
                onEffectParamChange();
              "
            >
              -2 st
            </button>
            <button
              class="rc-quick-btn"
              :class="{ active: config.pitchShift === 0 }"
              @click="
                config.pitchShift = 0;
                onEffectParamChange();
              "
            >
              0 st
            </button>
            <button
              class="rc-quick-btn"
              :class="{ active: config.pitchShift === 3 }"
              @click="
                config.pitchShift = 3;
                onEffectParamChange();
              "
            >
              +3 st
            </button>
          </div>
        </div>
      </div>

      <div class="rc-card-box">
        <div class="rc-section-header-compact">
          <span class="rc-section-title">dynamics</span>
        </div>

        <div class="rc-toggle-row">
          <div class="rc-toggle-row-text">
            <div class="rc-toggle-row-title">loudness normalization</div>
            <div class="rc-toggle-row-desc">
              matches playback volume across tracks
            </div>
          </div>
          <div
            class="rc-custom-switch"
            :class="{ active: config.loudnessNormalization }"
            role="switch"
            :aria-checked="config.loudnessNormalization"
            tabindex="0"
            @click="
              config.loudnessNormalization = !config.loudnessNormalization;
              onEffectParamChange();
            "
            @keydown.space.prevent="
              config.loudnessNormalization = !config.loudnessNormalization;
              onEffectParamChange();
            "
            @keydown.enter.prevent="
              config.loudnessNormalization = !config.loudnessNormalization;
              onEffectParamChange();
            "
          >
            <div class="rc-switch-track">
              <div class="rc-switch-thumb"></div>
            </div>
          </div>
        </div>

        <div class="rc-effect-control" v-if="config.loudnessNormalization">
          <div class="rc-control-meta">
            <span class="rc-control-name">target</span>
            <span
              class="rc-value-badge"
              :class="{ highlighted: config.targetLufs !== -14 }"
            >
              {{ config.targetLufs }} lufs
            </span>
          </div>

          <div
            class="rc-custom-slider-track"
            role="slider"
            aria-label="target loudness"
            :aria-valuemin="-24"
            :aria-valuemax="-9"
            :aria-valuenow="config.targetLufs"
            tabindex="0"
            @pointerdown="startSliderDrag('targetLufs', -24, -9, 1, $event)"
            @pointermove="onSliderPointerMove('targetLufs', -24, -9, 1, $event)"
            @pointerup="stopSliderDrag('targetLufs', $event)"
            @pointercancel="stopSliderDrag('targetLufs', $event)"
            @dblclick="
              config.targetLufs = -14;
              onEffectParamChange();
            "
          >
            <div
              class="rc-slider-center-tick"
              :style="{ left: `${((-14 - -24) / (-9 - -24)) * 100}%` }"
            ></div>
            <div
              class="rc-custom-slider-fill"
              :style="{ width: `${((config.targetLufs - -24) / (-9 - -24)) * 100}%` }"
            ></div>
            <div
              class="rc-custom-slider-thumb"
              :style="{
                left: `calc(${((config.targetLufs - -24) / (-9 - -24)) * 100}% - 6px)`,
              }"
            ></div>
          </div>

          <div class="rc-scale-labels">
            <span>-24 lufs</span>
            <span>-14 lufs</span>
            <span>-9 lufs</span>
          </div>
        </div>

        <div class="rc-toggle-row" style="margin-top: 8px;">
          <div class="rc-toggle-row-text">
            <div class="rc-toggle-row-title">limiter</div>
            <div class="rc-toggle-row-desc">
              prevents digital clipping and output distortion
            </div>
          </div>
          <div
            class="rc-custom-switch"
            :class="{ active: config.limiter }"
            role="switch"
            :aria-checked="config.limiter"
            tabindex="0"
            @click="
              config.limiter = !config.limiter;
              onEffectParamChange();
            "
            @keydown.space.prevent="
              config.limiter = !config.limiter;
              onEffectParamChange();
            "
            @keydown.enter.prevent="
              config.limiter = !config.limiter;
              onEffectParamChange();
            "
          >
            <div class="rc-switch-track">
              <div class="rc-switch-thumb"></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import {
  loadDspConfig,
  saveDspConfig,
  DSP_PRESETS,
  EqualizerBands,
  DspConfig,
} from "../../audio/dsp";
import { SETTING_KEYS, getBooleanSetting } from "../settings";
import { isNativeDrmFallbackActive } from "../../audio/player";

const subTab = ref<"eq" | "effects">("eq");
const config = reactive<DspConfig>(loadDspConfig());
const activePreset = ref(detectActivePreset(config));
const isRustAudio = ref(getBooleanSetting(SETTING_KEYS.RUST_AUDIO, false));
const isDrmFallback = ref(isNativeDrmFallbackActive());

const hoveredBand = ref<keyof EqualizerBands | null>(null);
const activeDragNode = ref<keyof EqualizerBands | null>(null);
const activeDragFader = ref<keyof EqualizerBands | null>(null);
const activeSliderKey = ref<string | null>(null);
const svgGraphRef = ref<SVGSVGElement | null>(null);

const bandFrequencies: {
  key: keyof EqualizerBands;
  label: string;
  tag: string;
}[] = [
  { key: "b32", label: "32", tag: "sub" },
  { key: "b64", label: "64", tag: "bass" },
  { key: "b125", label: "125", tag: "bass" },
  { key: "b250", label: "250", tag: "lo-mid" },
  { key: "b500", label: "500", tag: "mid" },
  { key: "b1k", label: "1k", tag: "mid" },
  { key: "b2k", label: "2k", tag: "hi-mid" },
  { key: "b4k", label: "4k", tag: "pres" },
  { key: "b8k", label: "8k", tag: "pres" },
  { key: "b16k", label: "16k", tag: "air" },
];

const nodeXCoords: number[] = [24, 63, 102, 141, 180, 220, 259, 298, 337, 376];
const GRAPH_W = 400;
const GRAPH_H = 92;
const ZERO_Y = 46;
const MAX_Y_OFFSET = 36;
const DB_RANGE = 12;

function getYForGain(gain: number): number {
  const clamped = Math.max(-12, Math.min(12, gain));
  return ZERO_Y - (clamped / DB_RANGE) * MAX_Y_OFFSET;
}

function getGainForY(y: number): number {
  const gain = ((ZERO_Y - y) / MAX_Y_OFFSET) * DB_RANGE;
  return Math.max(-12, Math.min(12, Math.round(gain * 2) / 2));
}

const curveSvgPath = computed(() => {
  const pts: { x: number; y: number }[] = bandFrequencies.map((b, i) => ({
    x: nodeXCoords[i],
    y: getYForGain(config.bands[b.key]),
  }));

  const pStart = { x: 0, y: pts[0].y };
  const pEnd = { x: GRAPH_W, y: pts[pts.length - 1].y };
  const allPts = [pStart, ...pts, pEnd];

  let d = `M ${allPts[0].x.toFixed(1)} ${allPts[0].y.toFixed(1)}`;
  for (let i = 0; i < allPts.length - 1; i++) {
    const p0 = i > 0 ? allPts[i - 1] : allPts[i];
    const p1 = allPts[i];
    const p2 = allPts[i + 1];
    const p3 = i + 2 < allPts.length ? allPts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
});

const curveAreaSvgPath = computed(() => {
  return `${curveSvgPath.value} L ${GRAPH_W} ${ZERO_Y} L 0 ${ZERO_Y} Z`;
});

function handleSettingChanged(e: Event) {
  const custom = e as CustomEvent<{ key: string; value: boolean }>;
  if (custom.detail?.key === SETTING_KEYS.RUST_AUDIO) {
    isRustAudio.value = custom.detail.value;
    if (!custom.detail.value && config.enabled) {
      config.enabled = false;
      save();
    }
  }
}

function handleDrmFallback(e: Event) {
  const custom = e as CustomEvent<{ active: boolean }>;
  isDrmFallback.value = custom.detail?.active ?? isNativeDrmFallbackActive();
}

onMounted(() => {
  window.addEventListener("rustcloud:setting-changed", handleSettingChanged);
  window.addEventListener("rustcloud:drm-fallback", handleDrmFallback);
});

onUnmounted(() => {
  window.removeEventListener("rustcloud:setting-changed", handleSettingChanged);
  window.removeEventListener("rustcloud:drm-fallback", handleDrmFallback);
});

function detectActivePreset(c: DspConfig): string {
  const bandKeys: (keyof EqualizerBands)[] = [
    "b32",
    "b64",
    "b125",
    "b250",
    "b500",
    "b1k",
    "b2k",
    "b4k",
    "b8k",
    "b16k",
  ];
  for (const [key, preset] of Object.entries(DSP_PRESETS)) {
    if (preset.bass !== c.bassBoost) continue;
    let match = true;
    for (const bk of bandKeys) {
      if (preset.bands[bk] !== c.bands[bk]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (
      preset.stereoWidth !== undefined &&
      preset.stereoWidth !== c.stereoWidth
    )
      continue;
    if (preset.crossfeed !== undefined && preset.crossfeed !== c.crossfeed)
      continue;
    if (preset.tubeWarmth !== undefined && preset.tubeWarmth !== c.tubeWarmth)
      continue;
    if (preset.clarity !== undefined && preset.clarity !== c.clarity) continue;
    if (preset.reverbWet !== undefined && preset.reverbWet !== c.reverbWet)
      continue;
    if (preset.reverbSize !== undefined && preset.reverbSize !== c.reverbSize)
      continue;
    if (preset.reverbDamp !== undefined && preset.reverbDamp !== c.reverbDamp)
      continue;
    if (preset.limiter !== undefined && preset.limiter !== c.limiter) continue;
    if (
      preset.loudnessNormalization !== undefined &&
      preset.loudnessNormalization !== c.loudnessNormalization
    )
      continue;
    if (
      preset.targetLufs !== undefined &&
      preset.targetLufs !== c.targetLufs
    )
      continue;
    if (
      preset.playbackSpeed !== undefined &&
      preset.playbackSpeed !== c.playbackSpeed
    )
      continue;
    if (preset.pitchShift !== undefined && preset.pitchShift !== c.pitchShift)
      continue;

    return key;
  }
  return "";
}

const activePresetLabel = computed(() => {
  if (!activePreset.value) return "";
  return DSP_PRESETS[activePreset.value]?.label || "";
});

const hasActiveEffects = computed(() => {
  return (
    config.stereoWidth !== 100 ||
    config.crossfeed ||
    config.tubeWarmth > 0 ||
    config.clarity > 0 ||
    config.reverbWet > 0 ||
    config.playbackSpeed !== 1.0 ||
    config.pitchShift !== 0 ||
    !config.limiter ||
    config.loudnessNormalization
  );
});

function formatBandVal(val: number): string {
  if (val > 0) return `+${val.toFixed(1)}`;
  if (val < 0) return val.toFixed(1);
  return "0.0";
}

function getWidthLabel(val: number): string {
  if (val === 0) return "mono";
  if (val < 80) return "narrow";
  if (val === 100) return "normal";
  if (val <= 140) return "wide";
  return "ultra-wide";
}

function save() {
  saveDspConfig(config);
}

function onToggleSwitch() {
  if (!isRustAudio.value) return;
  config.enabled = !config.enabled;
  save();
}

function startNodeDrag(key: keyof EqualizerBands, e: PointerEvent) {
  activeDragNode.value = key;
  const target = e.currentTarget as HTMLElement | SVGElement;
  if (target && target.setPointerCapture) {
    target.setPointerCapture(e.pointerId);
  }
  updateNodeDragPosition(e);
}

function onNodePointerMove(key: keyof EqualizerBands, e: PointerEvent) {
  if (activeDragNode.value === key) {
    updateNodeDragPosition(e);
  }
}

function stopNodeDrag(key: keyof EqualizerBands, e: PointerEvent) {
  if (activeDragNode.value === key) {
    activeDragNode.value = null;
    const target = e.currentTarget as HTMLElement | SVGElement;
    if (target && target.releasePointerCapture) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    activePreset.value = detectActivePreset(config);
    save();
  }
}

function updateNodeDragPosition(e: PointerEvent) {
  if (!activeDragNode.value || !svgGraphRef.value) return;
  const rect = svgGraphRef.value.getBoundingClientRect();
  const relY = ((e.clientY - rect.top) / rect.height) * GRAPH_H;
  const gain = getGainForY(relY);
  config.bands[activeDragNode.value] = gain;
  activePreset.value = "";
  save();
}

function startFaderDrag(key: keyof EqualizerBands, e: PointerEvent) {
  activeDragFader.value = key;
  const target = e.currentTarget as HTMLElement;
  if (target && target.setPointerCapture) {
    target.setPointerCapture(e.pointerId);
  }
  updateFaderPosition(key, target, e);
}

function onFaderPointerMove(key: keyof EqualizerBands, e: PointerEvent) {
  if (activeDragFader.value === key) {
    const target = e.currentTarget as HTMLElement;
    updateFaderPosition(key, target, e);
  }
}

function stopFaderDrag(key: keyof EqualizerBands, e: PointerEvent) {
  if (activeDragFader.value === key) {
    activeDragFader.value = null;
    const target = e.currentTarget as HTMLElement;
    if (target && target.releasePointerCapture) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    activePreset.value = detectActivePreset(config);
    save();
  }
}

function updateFaderPosition(
  key: keyof EqualizerBands,
  target: HTMLElement,
  e: PointerEvent,
) {
  const rect = target.getBoundingClientRect();
  const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
  const norm = 1 - relY / rect.height;
  const gain = (norm - 0.5) * 24;
  const stepped = Math.max(-12, Math.min(12, Math.round(gain * 2) / 2));
  config.bands[key] = stepped;
  activePreset.value = "";
  save();
}

function stepBand(key: keyof EqualizerBands, delta: number) {
  const current = config.bands[key];
  config.bands[key] = Math.max(
    -12,
    Math.min(12, Math.round((current + delta) * 2) / 2),
  );
  activePreset.value = detectActivePreset(config);
  save();
}

function resetBand(key: keyof EqualizerBands) {
  config.bands[key] = 0;
  activePreset.value = detectActivePreset(config);
  save();
}

function startSliderDrag(
  key: string,
  min: number,
  max: number,
  step: number,
  e: PointerEvent,
) {
  activeSliderKey.value = key;
  const target = e.currentTarget as HTMLElement;
  if (target && target.setPointerCapture) {
    target.setPointerCapture(e.pointerId);
  }
  updateSliderPosition(key, min, max, step, target, e);
}

function onSliderPointerMove(
  key: string,
  min: number,
  max: number,
  step: number,
  e: PointerEvent,
) {
  if (activeSliderKey.value === key) {
    const target = e.currentTarget as HTMLElement;
    updateSliderPosition(key, min, max, step, target, e);
  }
}

function stopSliderDrag(key: string, e: PointerEvent) {
  if (activeSliderKey.value === key) {
    activeSliderKey.value = null;
    const target = e.currentTarget as HTMLElement;
    if (target && target.releasePointerCapture) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    activePreset.value = detectActivePreset(config);
    save();
  }
}

function updateSliderPosition(
  key: string,
  min: number,
  max: number,
  step: number,
  target: HTMLElement,
  e: PointerEvent,
) {
  const rect = target.getBoundingClientRect();
  const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const norm = relX / rect.width;
  const raw = min + norm * (max - min);
  const stepped = Math.round((raw - min) / step) * step + min;
  const clamped = Math.max(min, Math.min(max, stepped));
  (config as any)[key] = Number(clamped.toFixed(2));
  activePreset.value = "";
  save();
}

function stepParam(key: string, min: number, max: number, delta: number) {
  const current = (config as any)[key] as number;
  const clamped = Math.max(min, Math.min(max, current + delta));
  (config as any)[key] = Number(clamped.toFixed(2));
  activePreset.value = detectActivePreset(config);
  save();
}

function onBassChange() {
  activePreset.value = detectActivePreset(config);
  save();
}

function onEffectParamChange() {
  activePreset.value = detectActivePreset(config);
  save();
}

function applyCurveAction(
  action: "flat" | "bass" | "vshape" | "vocal" | "treble" | "invert" | "smooth",
) {
  if (action === "flat") {
    for (const b of bandFrequencies) {
      config.bands[b.key] = 0;
    }
  } else if (action === "bass") {
    config.bands.b32 = 5;
    config.bands.b64 = 4;
    config.bands.b125 = 2.5;
    config.bands.b250 = 1;
    config.bands.b500 = 0;
    config.bands.b1k = 0;
    config.bands.b2k = 0;
    config.bands.b4k = 0;
    config.bands.b8k = 0;
    config.bands.b16k = 0;
  } else if (action === "vshape") {
    config.bands.b32 = 4.5;
    config.bands.b64 = 3.5;
    config.bands.b125 = 1.5;
    config.bands.b250 = 0;
    config.bands.b500 = -1;
    config.bands.b1k = -0.5;
    config.bands.b2k = 1;
    config.bands.b4k = 2.5;
    config.bands.b8k = 4;
    config.bands.b16k = 4.5;
  } else if (action === "vocal") {
    config.bands.b32 = -2.5;
    config.bands.b64 = -1.5;
    config.bands.b125 = -0.5;
    config.bands.b250 = 0.5;
    config.bands.b500 = 1.5;
    config.bands.b1k = 3;
    config.bands.b2k = 3.5;
    config.bands.b4k = 2.5;
    config.bands.b8k = 1;
    config.bands.b16k = 0;
  } else if (action === "treble") {
    config.bands.b32 = 0;
    config.bands.b64 = 0;
    config.bands.b125 = 0;
    config.bands.b250 = 0;
    config.bands.b500 = 0;
    config.bands.b1k = 0.5;
    config.bands.b2k = 1.5;
    config.bands.b4k = 3;
    config.bands.b8k = 4.5;
    config.bands.b16k = 5;
  } else if (action === "invert") {
    for (const b of bandFrequencies) {
      config.bands[b.key] = -config.bands[b.key];
    }
  } else if (action === "smooth") {
    const keys = bandFrequencies.map((b) => b.key);
    const newVals: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const prev = i > 0 ? config.bands[keys[i - 1]] : config.bands[keys[i]];
      const curr = config.bands[keys[i]];
      const next =
        i < keys.length - 1 ? config.bands[keys[i + 1]] : config.bands[keys[i]];
      const smoothed = (prev + curr * 2 + next) / 4;
      newVals[keys[i]] = Math.round(smoothed * 2) / 2;
    }
    for (const k of keys) {
      config.bands[k] = newVals[k];
    }
  }
  activePreset.value = detectActivePreset(config);
  save();
}

function resetAllToDefault() {
  config.bassBoost = 0;
  for (const b of bandFrequencies) {
    config.bands[b.key] = 0;
  }
  config.stereoWidth = 100;
  config.crossfeed = false;
  config.tubeWarmth = 0;
  config.clarity = 0;
  config.reverbWet = 0;
  config.reverbSize = 50;
  config.reverbDamp = 40;
  config.limiter = true;
  config.loudnessNormalization = false;
  config.targetLufs = -14;
  config.playbackSpeed = 1.0;
  config.pitchShift = 0;
  activePreset.value = "flat";
  save();
}

function applyPreset(key: string) {
  const p = DSP_PRESETS[key];
  if (!p) return;
  config.bassBoost = p.bass;
  Object.assign(config.bands, p.bands);
  if (p.stereoWidth !== undefined) config.stereoWidth = p.stereoWidth;
  if (p.crossfeed !== undefined) config.crossfeed = p.crossfeed;
  if (p.tubeWarmth !== undefined) config.tubeWarmth = p.tubeWarmth;
  if (p.clarity !== undefined) config.clarity = p.clarity;
  if (p.reverbWet !== undefined) config.reverbWet = p.reverbWet;
  if (p.reverbSize !== undefined) config.reverbSize = p.reverbSize;
  if (p.reverbDamp !== undefined) config.reverbDamp = p.reverbDamp;
  if (p.limiter !== undefined) config.limiter = p.limiter;
  if (p.loudnessNormalization !== undefined)
    config.loudnessNormalization = p.loudnessNormalization;
  if (p.targetLufs !== undefined) config.targetLufs = p.targetLufs;
  if (p.playbackSpeed !== undefined) config.playbackSpeed = p.playbackSpeed;
  if (p.pitchShift !== undefined) config.pitchShift = p.pitchShift;
  activePreset.value = key;
  save();
}
</script>

<style scoped>
.rc-equalizer-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rc-main-toggle-card {
  background: #141414;
  border: 1px solid #222222;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-main-toggle-card.is-active {
  background: #18110b;
  border-color: rgba(255, 85, 0, 0.4);
}
.rc-toggle-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rc-eq-icon-wrap {
  width: 28px;
  height: 28px;
  background: #1c1c1c;
  color: #777;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #282828;
  border-radius: 0;
}
.is-active .rc-eq-icon-wrap {
  background: var(--rc-primary);
  color: #fff;
  border-color: var(--rc-primary);
}
.rc-toggle-title {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-transform: lowercase;
}
.rc-toggle-sub {
  font-size: 10.5px;
  color: #777777;
  margin-top: 1px;
  text-transform: lowercase;
}

.rc-custom-switch {
  width: 32px;
  height: 16px;
  cursor: pointer;
  position: relative;
  outline: none;
  user-select: none;
}
.rc-custom-switch.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.rc-switch-track {
  position: absolute;
  inset: 0;
  background: #242424;
  border: 1px solid #333333;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-switch-thumb {
  position: absolute;
  width: 10px;
  height: 10px;
  left: 2px;
  top: 2px;
  background: #888888;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-custom-switch.active .rc-switch-track {
  background: #2a1608;
  border-color: var(--rc-primary);
}
.rc-custom-switch.active .rc-switch-thumb {
  transform: translateX(16px);
  background: var(--rc-primary);
}

.rc-subtabs-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #0d0d0d;
}
.rc-subtab-btn {
  background: #141414;
  border: 1px solid #222222;
  color: #888888;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: lowercase;
  border-radius: 0;
  position: relative;
  transition: all 0.12s ease;
}
.rc-subtab-btn:hover {
  background: #1c1c1c;
  color: #cccccc;
  border-color: #333333;
}
.rc-subtab-btn.active {
  background: #1e1e1e;
  border-color: var(--rc-primary);
  color: #ffffff;
}
.rc-active-dot {
  width: 4px;
  height: 4px;
  background: var(--rc-primary);
  border-radius: 0;
}

.rc-preset-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rc-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #aaaaaa;
  text-transform: lowercase;
  letter-spacing: 0.5px;
}
.rc-preset-badge {
  font-size: 10px;
  background: rgba(255, 85, 0, 0.15);
  color: var(--rc-primary);
  border: 1px solid rgba(255, 85, 0, 0.3);
  padding: 1px 6px;
  text-transform: lowercase;
  font-weight: 600;
  border-radius: 0;
}
.rc-reset-btn {
  background: transparent;
  border: 1px solid #333333;
  color: #888888;
  font-size: 10px;
  padding: 2px 7px;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
  transition: all 0.15s;
}
.rc-reset-btn:hover {
  color: #fff;
  border-color: #555555;
  background: rgba(255, 255, 255, 0.04);
}

.rc-preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 2px;
}
.rc-preset-card {
  background: #1c1c1c;
  border: 1px solid #2d2d2d;
  padding: 7px 10px;
  cursor: pointer;
  text-align: left;
  position: relative;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-preset-card:hover {
  background: #242424;
  border-color: #444444;
}
.rc-preset-card.active {
  background: #221c19;
  border-color: var(--rc-primary);
}
.rc-preset-indicator {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
}
.rc-preset-card.active .rc-preset-indicator {
  background: var(--rc-primary);
}
.rc-preset-name {
  font-size: 11px;
  font-weight: 600;
  color: #eeeeee;
}
.rc-preset-card.active .rc-preset-name {
  color: var(--rc-primary);
}
.rc-preset-desc {
  font-size: 9.5px;
  color: #777777;
  margin-top: 2px;
  line-height: 1.25;
}

.rc-graph-card {
  padding: 8px 10px 6px 10px;
}
.rc-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.rc-graph-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-graph-hint {
  font-size: 9.5px;
  color: #666666;
  text-transform: lowercase;
}
.rc-graph-actions {
  display: flex;
  gap: 4px;
}
.rc-mini-action-btn {
  background: transparent;
  border: 1px solid #333333;
  color: #888888;
  font-size: 9.5px;
  padding: 1px 5px;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
  transition: all 0.1s ease;
}
.rc-mini-action-btn:hover {
  background: #202020;
  color: #ffffff;
  border-color: #555555;
}

.rc-curve-container {
  width: 100%;
  height: 92px;
  background: #0e0e0e;
  border: 1px solid #202020;
  position: relative;
  user-select: none;
}
.rc-curve-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.rc-grid-line {
  stroke: #1b1b1b;
  stroke-width: 1;
}
.rc-grid-dashed {
  stroke-dasharray: 2 3;
}
.rc-grid-zero {
  stroke: #333333;
  stroke-width: 1;
}
.rc-grid-vert {
  stroke: #171717;
  stroke-dasharray: 1 3;
}
.rc-svg-label {
  fill: #555555;
  font-size: 8px;
  font-family: monospace;
}
.rc-curve-stroke {
  stroke: var(--rc-primary);
  stroke-width: 2;
}

.rc-curve-node-group {
  cursor: grab;
}
.rc-curve-node-group.active {
  cursor: grabbing;
}
.rc-curve-node {
  fill: #141414;
  stroke: #888888;
  stroke-width: 1.5;
  transition:
    transform 0.08s ease,
    stroke 0.1s ease;
}
.rc-curve-node.positive {
  stroke: var(--rc-primary);
  fill: #221208;
}
.rc-curve-node.negative {
  stroke: #e06c75;
  fill: #240c0f;
}
.rc-curve-node-group.hovered .rc-curve-node,
.rc-curve-node-group.active .rc-curve-node {
  stroke: #ffffff;
  fill: var(--rc-primary);
}

.rc-sculpt-bar {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  margin-top: 6px;
}
.rc-sculpt-btn {
  background: #181818;
  border: 1px solid #262626;
  color: #888888;
  font-size: 9.5px;
  font-weight: 500;
  padding: 3px 0;
  text-align: center;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
  transition: all 0.1s ease;
}
.rc-sculpt-btn:hover {
  background: #242424;
  border-color: #444444;
  color: #ffffff;
}

.rc-sliders-card {
  background: #141414;
  border: 1px solid #222222;
  padding: 8px 10px;
  border-radius: 0;
}
.rc-eq-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.rc-title-with-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-range-hint {
  font-size: 9.5px;
  font-family: monospace;
  color: #777777;
}
.rc-fader-controls-tip {
  font-size: 9px;
  color: #555555;
  text-transform: lowercase;
}

.rc-bands-container {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  align-items: center;
}
.rc-eq-band {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
}
.rc-eq-band.is-hovered .rc-band-label {
  color: #ffffff;
}

.rc-band-val-btn {
  background: transparent;
  border: none;
  font-size: 9px;
  font-family: monospace;
  font-weight: 600;
  cursor: pointer;
  padding: 1px 0;
  border-radius: 0;
  line-height: 1;
}
.rc-band-val-btn.positive {
  color: var(--rc-primary);
}
.rc-band-val-btn.negative {
  color: #e06c75;
}
.rc-band-val-btn.zero {
  color: #555555;
}
.rc-band-val-btn:hover {
  text-decoration: underline;
}

.rc-fader-track {
  width: 22px;
  height: 96px;
  background: #0f0f0f;
  border: 1px solid #262626;
  position: relative;
  cursor: pointer;
  user-select: none;
  outline: none;
}
.rc-fader-track:hover,
.rc-eq-band.is-dragging .rc-fader-track {
  border-color: #383838;
  background: #121212;
}
.rc-fader-track:focus-visible {
  border-color: var(--rc-primary);
}

.rc-fader-zero-line {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: #3a3a3a;
  pointer-events: none;
}

.rc-fader-fill {
  position: absolute;
  left: 4px;
  right: 4px;
  pointer-events: none;
  opacity: 0.85;
}
.rc-fader-fill.positive {
  background: var(--rc-primary);
}
.rc-fader-fill.negative {
  background: #e06c75;
}

.rc-fader-thumb {
  position: absolute;
  left: 0px;
  right: 0px;
  height: 14px;
  background: #242424;
  border: 1px solid #4a4a4a;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: border-color 0.1s ease;
}
.rc-eq-band.is-dragging .rc-fader-thumb,
.rc-fader-track:hover .rc-fader-thumb {
  background: #2c2c2c;
  border-color: var(--rc-primary);
}
.rc-fader-thumb-groove {
  width: 10px;
  height: 2px;
  background: #888888;
}
.rc-eq-band.is-dragging .rc-fader-thumb-groove {
  background: var(--rc-primary);
}

.rc-band-label-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}
.rc-band-label {
  font-size: 9.5px;
  font-weight: 600;
  color: #888888;
  font-family: monospace;
}
.rc-band-subtag {
  font-size: 7.5px;
  color: #555555;
  text-transform: lowercase;
}

.rc-bass-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.rc-bass-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-freq-tag {
  font-size: 10px;
  color: #666666;
  text-transform: lowercase;
}
.rc-bass-pill {
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
  background: #202020;
  border: 1px solid #333333;
  color: #888888;
  padding: 1px 6px;
  border-radius: 0;
}
.rc-bass-pill.nonzero {
  background: rgba(255, 85, 0, 0.12);
  border-color: rgba(255, 85, 0, 0.4);
  color: var(--rc-primary);
}

.rc-custom-slider-track {
  width: 100%;
  height: 18px;
  background: #181818;
  border: 1px solid #282828;
  position: relative;
  cursor: pointer;
  user-select: none;
  outline: none;
  box-sizing: border-box;
}
.rc-custom-slider-track:hover {
  border-color: #383838;
}
.rc-custom-slider-track:focus-visible {
  border-color: var(--rc-primary);
}
.rc-custom-slider-track.mini {
  height: 14px;
}

.rc-slider-center-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #444444;
  pointer-events: none;
}

.rc-custom-slider-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: rgba(255, 85, 0, 0.4);
  pointer-events: none;
}
.rc-custom-slider-thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  background: #ffffff;
  border: 1px solid #dddddd;
  pointer-events: none;
}
.rc-custom-slider-track:hover .rc-custom-slider-thumb {
  background: var(--rc-primary);
  border-color: var(--rc-primary);
}

.rc-quick-row {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.rc-quick-btn {
  flex: 1;
  background: #1c1c1c;
  border: 1px solid #2a2a2a;
  color: #777777;
  font-size: 9.5px;
  padding: 3px 0;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
  transition: all 0.1s ease;
}
.rc-quick-btn:hover {
  background: #242424;
  color: #ffffff;
  border-color: #444444;
}
.rc-quick-btn.active {
  background: #241912;
  border-color: var(--rc-primary);
  color: var(--rc-primary);
  font-weight: 600;
}

.rc-section-header-compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.rc-effect-control {
  margin-bottom: 8px;
}
.rc-effect-control:last-child {
  margin-bottom: 0;
}
.rc-control-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}
.rc-meta-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rc-control-name {
  font-size: 11px;
  color: #dddddd;
  font-weight: 500;
  text-transform: lowercase;
}
.rc-value-badge {
  font-size: 10px;
  font-weight: 700;
  font-family: monospace;
  background: #202020;
  border: 1px solid #333333;
  color: #888888;
  padding: 1px 5px;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rc-value-badge.highlighted {
  background: rgba(255, 85, 0, 0.12);
  border-color: rgba(255, 85, 0, 0.4);
  color: var(--rc-primary);
}
.rc-value-badge-mini {
  font-size: 9.5px;
  font-weight: 700;
  font-family: monospace;
  color: var(--rc-primary);
}
.rc-sublabel {
  font-size: 8.5px;
  color: #888888;
  text-transform: lowercase;
}
.rc-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #666666;
  margin-top: 2px;
  text-transform: lowercase;
}

.rc-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0 2px 0;
}
.rc-toggle-row-title {
  font-size: 11px;
  font-weight: 500;
  color: #dddddd;
  text-transform: lowercase;
}
.rc-toggle-row-desc {
  font-size: 9.5px;
  color: #777777;
  text-transform: lowercase;
}

.rc-dual-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 6px;
}
.rc-dual-col {
  display: flex;
  flex-direction: column;
}
</style>
