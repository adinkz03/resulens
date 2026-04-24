def clamp_score(value):
    """
    Ensures a scoring value stays between 0.0 and 1.0.
    """
    try:
        value = float(value)
    except (ValueError, TypeError):
        return 0.0

    return max(0.0, min(value, 1.0))


def normalize_degree(degree_string):
    """
    Converts degree text into a numerical score between 0.0 and 1.0.
    Kept for fallback/local support.
    """
    if not degree_string or "not parsed" in str(degree_string).lower():
        return 0.0

    if isinstance(degree_string, list):
        degree_string = " ".join(degree_string)

    d = str(degree_string).lower()

    if any(word in d for word in ["phd", "doctorate", "dr."]):
        return 1.0

    if any(word in d for word in ["master", "m.sc", "msc", "mba", "m.a", "mphil"]):
        return 0.9

    if any(word in d for word in ["bachelor", "b.s", "bsc", "b.a", "b.eng", "b.tech", "hons", "degree"]):
        return 0.8

    if any(word in d for word in ["diploma", "adv dip", "associate"]):
        return 0.6

    return 0.4


def normalize_skill(skill):
    """
    Kept for old/local fallback use.
    The new APS v2 model is no longer dependent on hardcoded IT skill matching.
    """
    skill = str(skill or "").lower().strip()
    skill = skill.replace("(", " ").replace(")", " ")
    skill = skill.replace(".", "").replace("/", " ")
    skill = skill.replace("-", " ")
    skill = " ".join(skill.split())

    aliases = {
        "github": "git",
        "git hub": "git",
        "git github": "git",
        "github git": "git",
        "gitlab": "git",
        "version control": "git",

        "javascript": "javascript",
        "java script": "javascript",
        "js": "javascript",

        "mysql": "mysql",
        "my sql": "mysql",

        "visual studio": "visual studio",
        "vs code": "visual studio code",
        "vscode": "visual studio code",

        "software development lifecycle": "sdlc",
        "software development life cycle": "sdlc",
        "development lifecycle": "sdlc",

        "data structure": "data structures",
        "algorithm": "algorithms",

        "command-line": "command line",
        "command line tools": "command line",
        "cli tools": "command line",

        "object oriented programming": "oop",
        "oop": "oop"
    }

    return aliases.get(skill, skill)


def calculate_skill_score(candidate_skills, required_skills):
    """
    Old technical skill coverage scoring.
    Kept only for backward compatibility / local fallback.
    """
    candidate_set = set()
    for skill in candidate_skills:
        normalized = normalize_skill(skill)
        if normalized:
            candidate_set.add(normalized)

    required_set = set()
    for skill in required_skills:
        normalized = normalize_skill(skill)
        if normalized:
            required_set.add(normalized)

    if not required_set:
        return 1.0

    matched = 0

    for req in required_set:
        for cand in candidate_set:
            if req == cand:
                matched += 1
                break

            if " " in req or " " in cand:
                if req in cand or cand in req:
                    matched += 1
                    break

    return matched / len(required_set)


def get_final_aps(data, weights):
    """
    Old APS calculation.
    Kept as backup for old records / old endpoint behavior.
    """
    default_weights = {
        "w1": 0.25,
        "w2": 0.10,
        "w3": 0.10,
        "w4": 0.10,
        "w5": 0.25,
        "w6": 0.20
    }

    if not isinstance(weights, dict):
        weights = default_weights

    try:
        weights = {k: float(weights.get(k, default_weights[k])) for k in default_weights}
    except (ValueError, TypeError):
        weights = default_weights

    s_degree = normalize_degree(data.get("degree", ""))
    s_skill = clamp_score(data.get("s_skill", 0))
    s_soft = clamp_score(data.get("s_soft", 0))
    s_major = clamp_score(data.get("s_major", 0))
    s_sim = clamp_score(data.get("s_sim", 0))
    s_exp = clamp_score(data.get("s_exp", 0))

    weighted_score = (
        weights["w1"] * s_skill +
        weights["w2"] * s_soft +
        weights["w3"] * s_degree +
        weights["w4"] * s_major +
        weights["w5"] * s_sim +
        weights["w6"] * s_exp
    )

    if weights["w1"] > 1:
        return round(weighted_score, 2)

    return round(weighted_score * 100, 2)


def get_final_aps_v2(data, weights):
    """
    APS v2: General Resume Screening Model.

    Components:
    w1 = Core Requirement Match
    w2 = Role-Specific Capability
    w3 = Experience Relevance
    w4 = Role Context Alignment
    w5 = Education & Credential Fit
    w6 = Evidence Quality / Confidence

    Supports decimal weights, such as 0.25, and percentage weights, such as 25.
    """
    default_weights = {
        "w1": 0.25,
        "w2": 0.20,
        "w3": 0.20,
        "w4": 0.15,
        "w5": 0.10,
        "w6": 0.10
    }

    if not isinstance(weights, dict):
        weights = default_weights

    try:
        weights = {k: float(weights.get(k, default_weights[k])) for k in default_weights}
    except (ValueError, TypeError):
        weights = default_weights

    s_core = clamp_score(data.get("s_core", 0))
    s_role_capability = clamp_score(data.get("s_role_capability", 0))
    s_experience_relevance = clamp_score(data.get("s_experience_relevance", 0))
    s_role_alignment = clamp_score(data.get("s_role_alignment", 0))
    s_education_credential = clamp_score(data.get("s_education_credential", 0))
    s_evidence_confidence = clamp_score(data.get("s_evidence_confidence", 0))

    weighted_score = (
        weights["w1"] * s_core +
        weights["w2"] * s_role_capability +
        weights["w3"] * s_experience_relevance +
        weights["w4"] * s_role_alignment +
        weights["w5"] * s_education_credential +
        weights["w6"] * s_evidence_confidence
    )

    if weights["w1"] > 1:
        return round(weighted_score, 2)

    return round(weighted_score * 100, 2)