// views/rewards.js - the payoff loop. Claiming draws a random reward from
// whichever pool is currently affordable (state.js already restricts the
// draw and tracks no-repeat-until-exhausted cycles), then shows a small
// reveal modal so the moment feels like opening something rather than
// reading a list.

import { icon } from './../icons.js';
import { escapeHtml } from './../dom.js';
import { burstConfetti } from './../confetti.js';

function poolListHtml(pool, balance, balanceUnit) {
  return pool
    .filter((r) => !r.disabled)
    .map(
      (r) => `
      <div class="reward-card" style="padding:8px 0;border-bottom:1px solid var(--border-soft)">
        <span class="reward-label ${r.cost > balance ? 'mute' : ''}">${escapeHtml(r.label)}</span>
        <span class="reward-cost ${r.cost > balance ? 'mute-2' : 'accent'}">${r.cost} ${balanceUnit}</span>
      </div>`
    )
    .join('');
}

function openRevealModal(reward, tier) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay fade-in';
  overlay.innerHTML = `
    <div class="modal">
      <div class="reward-reveal">
        <div class="reveal-icon">${icon(tier === 'big' ? 'gift' : 'star', 26)}</div>
        <div class="reveal-label"></div>
        <div class="mute" style="font-size:12.5px">${tier === 'big' ? 'Big reward' : 'Small reward'} claimed - enjoy it.</div>
        <button class="btn btn-primary btn-block" id="reveal-done">Nice</button>
      </div>
    </div>
  `;
  overlay.querySelector('.reveal-label').textContent = reward.label;
  document.body.appendChild(overlay);
  burstConfetti(tier === 'big' ? 46 : 26);
  overlay.querySelector('#reveal-done').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export function render(root, store) {
  function paint() {
    const data = store.data;
    const history = data.rewards.history.slice(0, 12);

    root.innerHTML = `
      <div class="view fade-in">
        <div class="view-header">
          <div>
            <h1>Rewards</h1>
            <div class="sub">Earn coins from sessions, stars from perfect days</div>
          </div>
          <div class="row">
            <span class="chip coin">${icon('coin', 14)} ${data.profile.coins}</span>
            <span class="chip star">${icon('star', 14)} ${data.profile.stars}</span>
          </div>
        </div>

        <div class="grid grid-cols-2">
          <div class="card">
            <div class="row between" style="margin-bottom:4px">
              <div style="font-weight:600;font-size:13.5px">Small rewards</div>
              <span class="mute mono" style="font-size:11px">paid in coins</span>
            </div>
            <div id="small-pool">${poolListHtml(data.rewards.small, data.profile.coins, 'coins')}</div>
            <button class="btn btn-primary btn-block" style="margin-top:12px" id="claim-small">${icon('gift', 14)} Claim a small reward</button>
          </div>
          <div class="card">
            <div class="row between" style="margin-bottom:4px">
              <div style="font-weight:600;font-size:13.5px">Big rewards</div>
              <span class="mute mono" style="font-size:11px">paid in stars</span>
            </div>
            <div id="big-pool">${poolListHtml(data.rewards.big, data.profile.stars, 'stars')}</div>
            <button class="btn btn-primary btn-block" style="margin-top:12px" id="claim-big">${icon('gift', 14)} Claim a big reward</button>
          </div>
        </div>

        <div class="card-raised" style="margin-top:16px">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px">Recent claims</div>
          <div id="history-list">
            ${
              history.length
                ? history
                    .map(
                      (h) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border-soft)">
                        <span style="font-size:13px">${escapeHtml(h.label)}</span>
                        <span class="mute mono" style="font-size:11.5px">${new Date(h.claimedAt).toLocaleDateString()} · ${h.cost} ${h.tier === 'big' ? 'stars' : 'coins'}</span>
                      </div>`
                    )
                    .join('')
                : `<div class="mute" style="font-size:12.5px">No rewards claimed yet - finish a session to start earning.</div>`
            }
          </div>
        </div>
      </div>
    `;

    root.querySelector('#claim-small').addEventListener('click', () => {
      const outcome = store.claimReward('small');
      if (!outcome.ok) {
        flashInsufficient(root, 'coins');
        return;
      }
      openRevealModal(outcome.reward, 'small');
    });
    root.querySelector('#claim-big').addEventListener('click', () => {
      const outcome = store.claimReward('big');
      if (!outcome.ok) {
        flashInsufficient(root, 'stars');
        return;
      }
      openRevealModal(outcome.reward, 'big');
    });
  }

  function flashInsufficient(root, unit) {
    const el = document.createElement('div');
    el.className = 'mute';
    el.style.fontSize = '12px';
    el.style.marginTop = '8px';
    el.textContent = `Not enough ${unit} yet - finish another session to earn more.`;
    const target = unit === 'coins' ? root.querySelector('#small-pool') : root.querySelector('#big-pool');
    target.parentElement.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  paint();
  const unsub = store.subscribe(paint);
  return () => unsub();
}
