/**
 * ApexStore / MockStore Interactive Script
 * Handles scenario tab navigation, payment radio selections,
 * accessibility keyboard events, and custom Paylens event dispatching.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Scenario Tab & Hash Navigation
  // =========================================================================

  const tabButtons = document.querySelectorAll('.demo-tab');
  const productSections = document.querySelectorAll('.product-pdp');

  function activateScenario(targetId, updateHash = true) {
    // 1. Update Tabs
    tabButtons.forEach((tab) => {
      const isTarget = tab.dataset.target === targetId;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    // 2. Update Product PDP Sections
    productSections.forEach((section) => {
      const isTarget = section.id === targetId;
      if (isTarget) {
        section.removeAttribute('hidden');
        section.classList.add('active');
      } else {
        section.setAttribute('hidden', '');
        section.classList.remove('active');
      }
    });

    // 3. Update URL Hash
    if (updateHash) {
      const hashName = targetId.replace('product-', '');
      history.replaceState(null, '', '#' + hashName);
    }

    // 4. Notify any observers about product view change
    const activeSection = document.getElementById(targetId);
    if (activeSection) {
      activeSection.dispatchEvent(new CustomEvent('pl-product-viewed', {
        bubbles: true,
        detail: {
          productId: activeSection.dataset.plId,
          title: activeSection.dataset.plTitle
        }
      }));
    }
  }

  // Bind Click Handlers to Tabs
  tabButtons.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.target;
      activateScenario(targetId);
    });
  });

  // Check URL Hash on Load
  function initHashRoute() {
    const hash = window.location.hash.toLowerCase().replace('#', '');
    if (hash === 'sony' || hash === 'wh1000xm5') {
      activateScenario('product-sony', false);
    } else if (hash === 'iphone' || hash === 'iphone16') {
      activateScenario('product-iphone', false);
    } else if (hash === 'laptop' || hash === 'rog') {
      activateScenario('product-laptop', false);
    } else {
      activateScenario('product-sony', false);
    }
  }

  // =========================================================================
  // 2. Interactive Payment Option Radio Group
  // =========================================================================

  function selectOption(optionCard) {
    if (!optionCard) return;

    const radioGroup = optionCard.closest('[role="radiogroup"]');
    if (!radioGroup) return;

    const allOptions = radioGroup.querySelectorAll('[data-pl-option]');
    allOptions.forEach((opt) => {
      opt.classList.remove('selected');
      opt.setAttribute('aria-checked', 'false');
    });

    // Select target
    optionCard.classList.add('selected');
    optionCard.setAttribute('aria-checked', 'true');
    optionCard.focus();

    // Find parent product section for context
    const productSection = optionCard.closest('[data-pl-product]');
    const productId = productSection ? productSection.dataset.plId : 'unknown';

    // Dispatch Custom Event for Paylens Adapter
    const eventDetail = {
      productId: productId,
      optionId: optionCard.dataset.plId,
      aliasId: optionCard.dataset.plAlias || null,
      optionType: optionCard.dataset.plType,
      monthlyInstallment: parseFloat(optionCard.dataset.plEmi || '0'),
      processingFee: parseFloat(optionCard.dataset.plFee || '0'),
      tenureMonths: parseInt(optionCard.dataset.plTenure || '1', 10),
      lostCashDiscount: parseFloat(optionCard.dataset.plLostDiscount || '0'),
      statedRate: parseFloat(optionCard.dataset.plRate || '0')
    };

    const changeEvent = new CustomEvent('pl-option-changed', {
      bubbles: true,
      detail: eventDetail
    });

    optionCard.dispatchEvent(changeEvent);

    console.log('[Paylens MockShop] Payment option selected:', eventDetail);
  }

  // Event Delegation for Option Clicks
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-pl-option]');
    if (card) {
      selectOption(card);
    }
  });

  // Keyboard Navigation for Radio Groups (WAI-ARIA Pattern)
  document.addEventListener('keydown', (e) => {
    const currentCard = e.target.closest('[data-pl-option]');
    if (!currentCard) return;

    const radioGroup = currentCard.closest('[role="radiogroup"]');
    if (!radioGroup) return;

    const options = Array.from(radioGroup.querySelectorAll('[data-pl-option]'));
    const currentIndex = options.indexOf(currentCard);

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      selectOption(currentCard);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % options.length;
      selectOption(options[nextIndex]);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + options.length) % options.length;
      selectOption(options[prevIndex]);
    }
  });

  // =========================================================================
  // 3. Purchase Button Micro-Interactions (Toast Feedback)
  // =========================================================================

  function showToast(message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<span>✓</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  document.addEventListener('click', (e) => {
    if (e.target.matches('.btn-primary')) {
      const activeProduct = document.querySelector('.product-pdp.active');
      const title = activeProduct ? activeProduct.dataset.plTitle : 'Item';
      showToast(`Redirecting to secure checkout for ${title}...`);
    } else if (e.target.matches('.btn-secondary')) {
      const activeProduct = document.querySelector('.product-pdp.active');
      const title = activeProduct ? activeProduct.dataset.plTitle : 'Item';
      showToast(`Added ${title} to your shopping cart!`);
    }
  });

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHashRoute);
  } else {
    initHashRoute();
  }
})();
