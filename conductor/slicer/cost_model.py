# Mariner's AI Grid - Satellite Cost Model (2026)
# SPDX-License-Identifier: Apache-2.0

"""
Cost estimation logic for satellite data transfer.
Based on 2026 pricing models for major maritime providers.

Rates (approximate):
- Starlink Maritime: $2.00/GB (Overage/Metered) -> $0.002/MB
- Iridium Certus 100: $6.00/MB (Overage/High-tier)
- Iridium Certus 700: $1.50/MB (Overage/Mid-tier)
- KVH VSAT: $0.50/MB (Metered/Hybrid)
"""

from dataclasses import dataclass
from enum import Enum

class SatProvider(Enum):
    STARLINK = "starlink"
    IRIDIUM_CERTUS_100 = "iridium_certus_100"
    IRIDIUM_CERTUS_700 = "iridium_certus_700"
    KVH_VSAT = "kvh_vsat"
    GENERIC_METERED = "generic_metered"

@dataclass
class CostEstimate:
    provider: SatProvider
    cost_usd: float
    rate_per_mb: float

class SatelliteCostModel:
    # 2026 Rates in USD per MB
    RATES = {
        SatProvider.STARLINK: 0.002,          # ~$2/GB
        SatProvider.IRIDIUM_CERTUS_100: 6.00, # ~$6/MB (Overage)
        SatProvider.IRIDIUM_CERTUS_700: 1.50, # ~$1.50/MB
        SatProvider.KVH_VSAT: 0.50,           # ~$0.50/MB
        SatProvider.GENERIC_METERED: 10.00    # Conservative fallback
    }

    @classmethod
    def estimate_cost(cls, size_bytes: int, provider: SatProvider) -> CostEstimate:
        """
        Calculate the estimated cost for transferring a file.
        """
        size_mb = size_bytes / (1024 * 1024)
        rate = cls.RATES.get(provider, cls.RATES[SatProvider.GENERIC_METERED])
        cost = size_mb * rate
        
        return CostEstimate(
            provider=provider,
            cost_usd=round(cost, 2),
            rate_per_mb=rate
        )

    @classmethod
    def get_all_estimates(cls, size_bytes: int) -> dict[str, float]:
        """
        Get estimates for all known providers.
        """
        estimates = {}
        for provider in cls.RATES:
            est = cls.estimate_cost(size_bytes, provider)
            estimates[provider.value] = est.cost_usd
        return estimates
