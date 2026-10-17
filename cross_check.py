from tax import calculate_new_regime_tax, calculate_old_regime_tax

salaries = [600_000, 1_000_000, 2_500_000]
print("================ CROSS-CHECK BENCHMARKS ================")
for g in salaries:
    n = calculate_new_regime_tax(g)
    # Typical profile: Basic 50%, HRA 20%, Rent 20%, PF 6%
    o = calculate_old_regime_tax(
        gross_annual=g,
        basic_annual=g * 0.50,
        hra_annual=g * 0.20,
        rent_annual=g * 0.20,
        is_metro=True,
        pf_employee_annual=g * 0.06
    )
    print(f"\n--- Gross Salary: Rs {g:,.2f} ---")
    print(f"New Regime: Taxable: Rs {n['taxable_income']:,.2f} | Standard Deduction: Rs {n['standard_deduction']:,.2f} | Total Annual Tax: Rs {n['total_annual_tax']:,.2f}")
    print(f"Old Regime: Taxable: Rs {o['taxable_income']:,.2f} | Deductions (Std + HRA + 80C): Rs {o['total_deductions']:,.2f} | Total Annual Tax: Rs {o['total_annual_tax']:,.2f}")
    better = "NEW" if n['total_annual_tax'] <= o['total_annual_tax'] else "OLD"
    savings = abs(n['total_annual_tax'] - o['total_annual_tax'])
    print(f"Verdict: {better} Regime is better by Rs {savings:,.2f}/year")
