export function updateUniversalAlertBar(alertsSummary) {
    if (!alertsSummary) return;
    const critEl = document.getElementById('bar-crit-num');
    const highEl = document.getElementById('bar-high-num');
    const revEl = document.getElementById('bar-review-num');
    const bannerEl = document.getElementById('bar-crit-banner');
    const freshEl = document.getElementById('bar-pcc-freshness');
    const sidebarBadge = document.getElementById('snf-sidebar-badge');

    if (critEl) critEl.textContent = alertsSummary.critical || 0;
    if (highEl) highEl.textContent = alertsSummary.high || 0;
    if (revEl) revEl.textContent = alertsSummary.review || 0;

    if (bannerEl) {
      if (alertsSummary.critical > 0) {
        bannerEl.hidden = false;
        bannerEl.textContent = `⚠️ ${alertsSummary.critical} CRITICAL CLINICAL ITEM(S) REQUIRE IMMEDIATE REVIEW`;
      } else {
        bannerEl.hidden = true;
      }
    }

    if (freshEl && alertsSummary.feedStatus) {
      const fs = alertsSummary.feedStatus;
      freshEl.hidden=!fs.monitoringEnabled;
      freshEl.textContent = `PCC report date: ${fs.monitoringCurrentThroughFormatted} (${fs.isSurveillanceComplete ? 'Feeds current' : '⚠️ Feed Alert'})`;
      freshEl.className = 'alert-bar-pcc-status ' + (fs.isSurveillanceComplete ? 'status-ok' : 'status-warn');
    }

    if (sidebarBadge) {
      const total = alertsSummary.totalUnresolved || 0;
      sidebarBadge.textContent = total === 1 ? '1 Alert' : `${total} Alerts`;
      sidebarBadge.className = 'snf-sidebar-badge ' + (alertsSummary.critical > 0 ? 'badge-crit' : alertsSummary.high > 0 ? 'badge-high' : 'badge-normal');
    }
  }
