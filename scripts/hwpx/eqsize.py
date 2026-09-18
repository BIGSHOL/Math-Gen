"""Width of an HWP equation box as Hancom lays it out (HYhwpEQ), without Hancom.

Hancom re-flows lines and pages when it opens an HWPX file but never re-measures an
equation: it keeps the stored ``<hp:sz>`` and draws the equation inside it. A box that
is too narrow makes the following text overlap the equation, one that is too wide
leaves a gap. Every rule and constant below was recovered by having Hancom (COM) size
thousands of probe equations at 22 font sizes (``eq_measure.py``). On 3,000 held-out
exam equations at the preview sizes it is exact for 97.9% and within 1% for 99.9%.
``pt`` is the equation base size in points (``baseUnit / 100``).

* Glyphs: Hancom draws the font at an even pixel size ``E = even(pt * 4/3)`` and rounds
  each glyph to whole pixels, so a glyph is ``round(advance * E) * 75`` HWPUNIT.
* Spacing is continuous: ``round(pt * m) * 7`` per side (m = 1 around brackets and after
  commas, 2 around binary operators, 3 around relations). After a scripted atom the
  unit is 10 instead of 7; after a fraction or root it is 0.
* Sub/superscripts use the font at ``pt * 0.682``.
* Fraction: ``max(num, den) + 0.5 em``, at least 1 em. Root: ``content + E px + 0.17 em``.
"""
import math
import re

_ITALIC = {
    "A": 0.752604, "B": 0.708330, "C": 0.721354, "D": 0.764062, "E": 0.680469,
    "F": 0.653646, "G": 0.783854, "H": 0.752604, "I": 0.360243, "J": 0.514062,
    "K": 0.778646, "L": 0.627604, "M": 0.915365, "N": 0.752604, "O": 0.778646,
    "P": 0.680469, "Q": 0.778646, "R": 0.735938, "S": 0.555469, "T": 0.721354,
    "U": 0.752604, "V": 0.752604, "W": 1.026910, "X": 0.752604, "Y": 0.752604,
    "Z": 0.610938, "a": 0.529514, "b": 0.428385, "c": 0.431534, "d": 0.520032,
    "e": 0.466518, "f": 0.540365, "g": 0.475781, "h": 0.576562, "i": 0.346354,
    "j": 0.408854, "k": 0.520032, "l": 0.299479, "m": 0.877604, "n": 0.600260,
    "o": 0.485938, "p": 0.500000, "q": 0.446615, "r": 0.451562, "s": 0.470486,
    "t": 0.360243, "u": 0.571615, "v": 0.485938, "w": 0.716146, "x": 0.571615,
    "y": 0.490885, "z": 0.466518,
}
_ROMAN = {
    "A": 0.752604, "B": 0.666406, "C": 0.666406, "D": 0.708330, "E": 0.666406,
    "F": 0.627604, "G": 0.708330, "H": 0.752604, "I": 0.377604, "J": 0.458330,
    "K": 0.752604, "L": 0.627604, "M": 0.915365, "N": 0.752604, "O": 0.708330,
    "P": 0.627604, "Q": 0.708330, "R": 0.666406, "S": 0.627604, "T": 0.752604,
    "U": 0.752604, "V": 0.708330, "W": 0.958330, "X": 0.666406, "Y": 0.666406,
    "Z": 0.627604, "a": 0.500000, "b": 0.541670, "c": 0.500000, "d": 0.541670,
    "e": 0.541670, "f": 0.377604, "g": 0.541670, "h": 0.541670, "i": 0.291670,
    "j": 0.291670, "k": 0.541670, "l": 0.291670, "m": 0.833594, "n": 0.541670,
    "o": 0.541670, "p": 0.541670, "q": 0.541670, "r": 0.415365, "s": 0.500000,
    "t": 0.377604, "u": 0.541670, "v": 0.541670, "w": 0.791670, "x": 0.582292,
    "y": 0.582292, "z": 0.458330,
}
_SYMBOL = {
    "!": 0.278646, "\"{\"": 0.579688, "\"}\"": 0.579688, "\"∅\"": 1.000000, "\"가\"": 1.000000,
    "'": 0.270830, "(": 0.389062, ")": 0.389062, "*": 0.500000, "+": 0.778646,
    ",": 0.278646, "-": 0.755729, "->": 1.000000, ".": 0.278646, "/": 0.500000,
    "0": 0.500000, "1": 0.500000, "2": 0.500000, "3": 0.500000, "4": 0.500000,
    "5": 0.500000, "6": 0.500000, "7": 0.500000, "8": 0.500000, "9": 0.500000,
    ":": 0.278646, ";": 0.278646, "<": 0.846354, "=": 0.778646, "=>": 1.625000,
    ">": 0.846354, "ANGLE": 1.000000, "CDOT": 1.000000, "CDOTS": 1.000000, "DIV": 0.809896,
    "GEQ": 1.000000, "LDOTS": 0.833330, "LEQ": 1.000000, "PLUSMINUS": 0.809896, "RARROW": 1.000000,
    "SMALLINTER": 1.000000, "SMALLUNION": 1.000000, "TIMES": 0.809896, "[": 0.278646, "]": 0.278646,
    "alpha": 0.639757, "beta": 0.565104, "cdots": 1.000000, "circ": 1.000000, "delta": 0.444531,
    "gamma": 0.517188, "in": 1.000000, "infty": 1.000000, "lambda": 0.582292, "mu": 0.602865,
    "neq": 1.000000, "notin": 1.000000, "omega": 0.614580, "phi": 0.594952, "pi": 0.571615,
    "sigma": 0.571615, "subset": 1.000000, "theta": 0.470486, "|": 0.200521, "°": 0.434896,
    "±": 0.809896, "·": 0.333594, "×": 0.809896, "÷": 0.809896, "α": 0.639757,
    "β": 0.565104, "γ": 0.517188, "δ": 0.444531, "θ": 0.470486, "λ": 0.582292,
    "μ": 0.602865, "π": 0.571615, "σ": 0.571615, "φ": 0.594952, "ω": 0.614580,
    "‘": 0.270830, "’": 0.270830, "→": 1.000000, "⇒": 1.000000, "∅": 1.000000,
    "∈": 1.000000, "∉": 1.000000, "√": 1.000000, "∞": 1.000000, "∠": 1.000000,
    "∩": 1.000000, "∪": 1.000000, "∼": 1.000000, "⊂": 1.000000, "⋯": 1.000000,
    "①": 1.000000, "②": 1.000000, "③": 1.000000, "□": 1.000000, "△": 1.000000,
}
# word: (advance em, pixel-rounded glyph, spacing class) - measured in Hancom
_KEYWORDS = {
    "ALEPH": (1.0, True, "ord"), "ANGLE": (1.0, True, "ord"), "APPROX": (1.0, True, "bin"),
    "ASYMP": (1.0, True, "bin"), "BECAUSE": (1.0, True, "ord"), "BIGCAP": (1.142857, True, "ord"),
    "BIGCUP": (1.142857, True, "ord"), "BOT": (1.0, True, "ord"), "BULLET": (1.0, True, "bin"),
    "CDOT": (1.0, True, "ord"), "CDOTS": (1.0, True, "rel"), "CIRC": (1.0, True, "bin"),
    "CONG": (1.0, True, "bin"), "COPROD": (1.285714, True, "ord"), "Chi": (0.832589, True, "ord"),
    "DAGGER": (0.533482, True, "ord"), "DDAGGER": (0.533482, True, "ord"), "DDOTS": (1.0, True, "rel"),
    "DEG": (0.765625, True, "ord"), "DIAMOND": (1.0, True, "bin"), "DINT": (1.71, False, "ord"),
    "DIV": (0.809896, True, "bin"), "DOTEQ": (1.0, True, "bin"), "DOWNARROW": (1.0, True, "ord"),
    "Delta": (0.832589, True, "ord"), "ELL": (0.435268, True, "ord"), "EMPTYSET": (1.0, True, "ord"),
    "EQUIV": (1.0, True, "bin"), "EXIST": (1.0, True, "ord"), "FORALL": (1.0, True, "ord"),
    "GE": (1.0, True, "rel"), "GEQ": (1.0, True, "rel"), "Gamma": (0.631696, True, "ord"),
    "HBAR": (0.564732, True, "ord"), "IMAG": (0.564732, True, "ord"), "IMATH": (0.301339, True, "ord"),
    "IN": (1.0, True, "ord"), "INF": (1.0, True, "ord"), "INFTY": (1.0, True, "ord"),
    "INT": (1.26, False, "ord"), "INTER": (1.142857, True, "ord"), "JMATH": (0.368304, True, "ord"),
    "LAPLACE": (1.0, True, "ord"), "LARROW": (1.0, True, "ord"), "LDOTS": (0.83333, True, "rel"),
    "LE": (1.0, True, "rel"), "LEQ": (1.0, True, "rel"), "LEQft": (2.235, False, "rel"),
    "LNOT": (0.667411, True, "ord"), "LRARROW": (1.0, True, "ord"), "Lambda": (0.698661, True, "ord"),
    "MINUSPLUS": (1.0, True, "bin"), "MODELS": (1.0, True, "ord"), "NABLA": (1.0, True, "ord"),
    "NE": (1.0, True, "bin"), "NEQ": (1.0, True, "bin"), "NOTIN": (1.0, True, "bin"),
    "OINT": (1.26, False, "ord"), "OPLUS": (1.0, True, "ord"), "OTIMES": (1.0, True, "ord"),
    "OWNS": (1.0, True, "ord"), "Omega": (0.765625, True, "ord"), "PARALLEL": (1.0, True, "ord"),
    "PARTIAL": (0.5, True, "ord"), "PLUSMINUS": (0.809896, True, "bin"), "PREC": (1.0, True, "rel"),
    "PROD": (1.285714, True, "ord"), "PROPTO": (1.0, True, "ord"), "Phi": (0.667411, True, "ord"),
    "Pi": (0.832589, True, "ord"), "Psi": (0.631696, True, "ord"), "RARROW": (1.0, True, "ord"),
    "REIMAGE": (1.0, True, "bin"), "SIM": (1.0, True, "bin"), "SIMEQ": (1.0, True, "bin"),
    "SMALLINTER": (1.0, True, "ord"), "SMALLUNION": (1.0, True, "ord"), "STAR": (1.0, True, "bin"),
    "SUBSET": (1.0, True, "rel"), "SUBSETEQ": (1.0, True, "rel"), "SUCC": (1.0, True, "rel"),
    "SUM": (1.214286, True, "ord"), "SUPSET": (1.0, True, "rel"), "SUPSETEQ": (1.0, True, "rel"),
    "Sigma": (0.765625, True, "ord"), "THEREFORE": (1.0, True, "ord"), "TIMES": (0.809896, True, "bin"),
    "TINT": (2.16, False, "ord"), "TOP": (1.0, True, "ord"), "TRIANGLE": (1.0, True, "ord"),
    "Theta": (0.765625, True, "ord"), "UDARROW": (1.0, True, "ord"), "UNION": (1.142857, True, "ord"),
    "UPARROW": (1.0, True, "ord"), "Upsilon": (0.564732, True, "ord"), "VDASH": (1.0, True, "ord"),
    "VDOTS": (1.0, True, "rel"), "VEE": (1.0, True, "ord"), "WEDGE": (1.0, True, "ord"),
    "WP": (0.631696, True, "ord"), "XOR": (1.0, True, "ord"), "Xi": (0.734375, True, "ord"),
    "alpha": (0.639757, True, "ord"), "angle": (1.0, True, "ord"), "approx": (1.0, True, "bin"),
    "asymp": (1.0, True, "bin"), "because": (1.0, True, "ord"), "beta": (0.565104, True, "ord"),
    "bot": (1.0, True, "ord"), "bullet": (1.0, True, "bin"), "cdot": (1.0, True, "ord"),
    "cdots": (1.0, True, "rel"), "chi": (0.631696, True, "ord"), "circ": (1.0, True, "bin"),
    "cong": (1.0, True, "bin"), "delta": (0.444531, True, "ord"), "div": (0.801339, True, "bin"),
    "doteq": (1.0, True, "bin"), "downarrow": (1.0, True, "ord"), "emptyset": (1.0, True, "ord"),
    "epsilon": (0.399554, True, "ord"), "equiv": (1.0, True, "bin"), "eta": (0.5, True, "ord"),
    "exists": (1.0, True, "ord"), "gamma": (0.517188, True, "ord"), "geq": (1.0, True, "rel"),
    "hookleft": (1.0, True, "ord"), "hookright": (1.0, True, "ord"), "in": (1.0, True, "ord"),
    "inf": (1.0, True, "ord"), "infty": (1.0, True, "ord"), "iota": (0.368304, True, "ord"),
    "ital": (0.801339, True, "ord"), "its": (0.5, True, "ord"), "kappa": (0.564732, True, "ord"),
    "lambda": (0.582292, True, "ord"), "langle": (0.868304, True, "rel"), "ldots": (0.832589, True, "rel"),
    "le": (1.0, True, "rel"), "leq": (1.0, True, "rel"), "mapsto": (1.0, True, "ord"),
    "mu": (0.602865, True, "ord"), "nabla": (1.0, True, "ord"), "nearrow": (1.0, True, "ord"),
    "neq": (1.0, True, "bin"), "notin": (1.0, True, "bin"), "nu": (0.5, True, "ord"),
    "num": (1.368304, True, "ord"), "nwarrow": (1.0, True, "ord"), "omega": (0.61458, True, "ord"),
    "oplus": (1.0, True, "ord"), "otimes": (1.0, True, "ord"), "owns": (1.0, True, "ord"),
    "parallel": (1.0, True, "ord"), "partial": (0.5, True, "ord"), "phi": (0.594952, True, "ord"),
    "pi": (0.571615, True, "ord"), "prec": (1.0, True, "rel"), "prime": (0.301339, True, "ord"),
    "propto": (1.0, True, "ord"), "psi": (0.631696, True, "ord"), "rangle": (0.868304, True, "rel"),
    "rho": (0.5, True, "ord"), "searrow": (1.0, True, "ord"), "sigma": (0.571615, True, "ord"),
    "sim": (1.0, True, "bin"), "simeq": (1.0, True, "bin"), "star": (1.0, True, "bin"),
    "subset": (1.0, True, "rel"), "subseteq": (1.0, True, "rel"), "succ": (1.0, True, "rel"),
    "supset": (1.0, True, "rel"), "supseteq": (1.0, True, "rel"), "swarrow": (1.0, True, "ord"),
    "tau": (0.435268, True, "ord"), "therefore": (1.0, True, "ord"), "theta": (0.470486, True, "ord"),
    "times": (0.801339, True, "bin"), "top": (1.0, True, "ord"), "udarrow": (1.0, True, "ord"),
    "uparrow": (1.0, True, "ord"), "upsilon": (0.564732, True, "ord"), "varepsilon": (0.435268, True, "ord"),
    "varphi": (0.631696, True, "ord"), "vartheta": (0.564732, True, "ord"), "vdash": (1.0, True, "ord"),
    "vee": (1.0, True, "ord"), "wedge": (1.0, True, "ord"), "xi": (0.435268, True, "ord"),
    "zeta": (0.435268, True, "ord"),
}
_FUNCTIONS = ["Lim", "arccos", "arcsin", "arctan", "arg", "cos", "cosec", "cosh", "cot", "coth", "csc", "det", "dim", "exp", "gcd", "hom", "ker", "lcm", "lg", "lim", "ln", "log", "max", "min", "mod", "sec", "sin", "sinh", "tan", "tanh"]
# Glyphs drawn from parts, whose width does not follow one advance: (pt, HWPUNIT) by size.
_MEASURED = {
    "'": ((8, 225), (9, 300), (9.5, 225), (10, 300), (10.5, 375), (11, 300), (11.34, 300), (11.5, 300), (12, 375), (12.25, 375), (13, 375), (14, 375), (15, 375), (16, 450), (18, 450), (20, 525), (24, 675), (30, 825), (36, 975), (48, 1275), (60, 1650), (72, 1950)),
    "ω": ((8, 450), (9, 525), (9.5, 525), (10, 675), (10.5, 750), (11, 675), (11.34, 750), (11.5, 750), (12, 825), (12.25, 825), (13, 825), (14, 825), (15, 900), (16, 975), (18, 1125), (20, 1200), (24, 1500), (30, 1875), (36, 2175), (48, 2925), (60, 3675), (72, 4425)),
    "‘": ((8, 225), (9, 225), (9.5, 225), (10, 300), (10.5, 300), (11, 300), (11.34, 300), (11.5, 300), (12, 375), (12.25, 375), (13, 375), (14, 375), (15, 375), (16, 450), (18, 450), (20, 525), (24, 675), (30, 825), (36, 975), (48, 1275), (60, 1650), (72, 1950)),
    "omega": ((8, 450), (9, 525), (9.5, 525), (10, 675), (10.5, 750), (11, 675), (11.34, 750), (11.5, 750), (12, 825), (12.25, 825), (13, 825), (14, 825), (15, 900), (16, 975), (18, 1125), (20, 1200), (24, 1500), (30, 1875), (36, 2175), (48, 2925), (60, 3675), (72, 4425)),
    "LDOTS": ((8, 600), (9, 750), (9.5, 750), (10, 900), (10.5, 1050), (11, 900), (11.34, 975), (11.5, 975), (12, 975), (12.25, 975), (13, 1125), (14, 1125), (15, 1275), (16, 1350), (18, 1500), (20, 1650), (24, 2025), (30, 2475), (36, 3000), (48, 3975), (60, 4950), (72, 6000)),
}
_MEASURED["’"] = _MEASURED["‘"]

# Spacing classes of single characters (keywords carry theirs in _KEYWORDS).
_CHAR_CLASS = {
    "+": "bin", "-": "bin", "±": "bin", "∓": "bin", "×": "bin", "÷": "bin", "∼": "bin",
    "≠": "bin", "∘": "bin", "∉": "bin",
    "=": "rel", "<": "rel", ">": "rel", ":": "rel", "≤": "rel", "≥": "rel", "⊂": "rel",
    "⊃": "rel", "⊆": "rel", "⊇": "rel",
    ",": "punct", ";": "punct",
    "(": "open", "[": "open", ")": "close", "]": "close",
    "⋯": "dots",
}
_DOTS = {"CDOTS", "cdots", "LDOTS", "ldots", "VDOTS", "DDOTS", "⋯"}
# Accents that widen their content by a fixed overhang vs. ones drawn within it.
_OVER_ACCENTS = {"bar", "vec", "under", "underline", "BAR", "VEC", "OVERLINE", "UNDERLINE"}
_HAT_ACCENTS = {"hat", "HAT", "tilde", "TILDE", "check"}
_THIN_ACCENTS = {"dot", "ddot", "acute", "grave", "arch", "DOT", "DDOT", "ACUTE", "GRAVE"}
_MATRICES = {"MATRIX", "PMATRIX", "BMATRIX", "DMATRIX", "CASES", "PILE", "LPILE", "RPILE", "EQALIGN"}
_FALLBACK_ADVANCE = .55   # glyphs never measured (unusual symbols)
_SCRIPT_RATIO = .682      # Hancom's sub/superscript size (feasible range .677-.687)

_TOKEN = re.compile(r'"[^"]*"?|[A-Za-z]+|[0-9]|->|\+-|\s+|.', re.S)


def _even_px(pt):
    return 2 * math.floor(pt * 4 / 3 / 2 + .5)


def _glyph(advance, pt):
    return math.floor(advance * _even_px(pt) + .5) * 75


def _space(pt, m, unit):
    return math.floor(pt * m + .5) * unit


class _Atom:
    """A laid-out item: width, spacing class and the spacing unit of its right side.

    ``unit`` is 7 for plain atoms, 10 after a sub/superscript and 0 after a fraction,
    root, accent, box, matrix or LEFT/RIGHT group. ``italic`` marks an italic letter (a
    following function name gets a thin gap) and ``tail`` extra width that only shows
    when no operator, relation or bracket follows (slant of a scripted capital).
    """
    __slots__ = ("width", "cls", "right", "unit", "italic", "tail")

    def __init__(self, width, cls="ord", unit=7, italic=False, tail=0):
        self.width, self.cls, self.unit, self.italic, self.tail = width, cls, unit, italic, tail
        self.right = None  # class facing the next atom, when it differs from ``cls``


_RESTART = object()


class _Parser:
    def __init__(self, script):
        self.tokens = [t for t in _TOKEN.findall(script) if not t.isspace()]
        self.i = 0

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def take(self):
        token = self.peek()
        self.i += 1
        return token

    def sequence(self, stops=(), style="it"):
        """Items up to a stop token; ``#`` starts a new row."""
        rows, items = [], []
        while (token := self.peek()) is not None and token not in stops:
            if token == "#":
                self.take()
                rows.append(items)
                items = []
            elif token == "&":
                self.take()
                items.append(("cell",))
            elif token in ("rm", "it", "bold"):
                self.take()
                style = "rm" if token == "rm" else "it"
                if token == "it":
                    # Hancom lays out what follows ``it`` as a fresh start: an operator
                    # right after it gets no left space (rm A it =1).
                    items.append(("restart",))
            elif token in ("over", "atop") and items:
                self.take()
                numerator = items.pop()
                items.append(("frac", [numerator], self.term(style)))
            else:
                items.extend(self.term(style))
        rows.append(items)
        return rows

    def term(self, style):
        base = self.atom(style)
        while self.peek() in ("^", "_"):
            kind = self.take()
            script = self.atom(style)
            if not base:
                base = [("bare",)]
            last = base[-1]
            if last[0] == "script":
                last[2 if kind == "^" else 3].extend(script)
            else:
                base[-1] = ("script", last, script if kind == "^" else [], script if kind == "_" else [])
        return base

    def atom(self, style):
        token = self.take()
        if token is None or token == "}":
            return []
        if token == "{":
            rows = self.sequence(("}",), style)
            if self.peek() == "}":
                self.take()
            return [("group", rows)]
        if token.startswith('"'):
            return [("text", token.strip('"'))]
        if token in ("~", "`"):
            return [("space", .5 if token == "~" else .125)]
        if token in ("^", "_"):
            self.i -= 1
            return []
        if token.isalpha() and len(token) > 1:
            return self.keyword(token, style)
        if token.isalpha():
            return [("glyph", token, style)]
        return [("glyph", "±" if token == "+-" else token, "it")]

    def keyword(self, word, style):
        if word == "sqrt":
            return [("sqrt", self.atom(style))]
        if word == "root":
            self.atom(style)
            if self.peek() == "of":
                self.take()
            return [("sqrt", self.atom(style))]
        if word == "LEFT":
            left = self.take() or ""
            inner = self.sequence(("RIGHT",), style)
            right = ""
            if self.peek() == "RIGHT":
                self.take()
                right = self.take() or ""
            return [("fence", left, inner, right)]
        if word in _OVER_ACCENTS or word in _HAT_ACCENTS or word in _THIN_ACCENTS:
            return [("accent", word, self.atom(style))]
        if word in _MATRICES:
            body = self.atom(style)
            rows = body[0][1] if body and body[0][0] == "group" else [body]
            return [("matrix", word, rows)]
        if word == "BOX":
            return [("box", self.atom(style))]
        if word in _FUNCTIONS:
            return [("func", word)]
        if word in _KEYWORDS or word in _SYMBOL:
            return [("glyph", word, "it")]
        # An unknown letter run is a product of single-letter variables (``ax``, ``AB``).
        return [("glyph", ch, style) for ch in word]


def _measured(key, pt):
    pairs = _MEASURED[key]
    if pt <= pairs[0][0]:
        return pairs[0][1] * pt / pairs[0][0]
    for (p0, w0), (p1, w1) in zip(pairs, pairs[1:]):
        if pt <= p1:
            return w0 + (w1 - w0) * (pt - p0) / (p1 - p0)
    return pairs[-1][1] * pt / pairs[-1][0]


def _glyph_width(key, style, pt):
    if key in _MEASURED:
        return _measured(key, pt)
    if len(key) == 1 and key.isascii() and key.isalpha():
        return _glyph((_ROMAN if style == "rm" else _ITALIC).get(key, _FALLBACK_ADVANCE), pt)
    if key in _SYMBOL:
        return _glyph(_SYMBOL[key], pt)
    if key in _KEYWORDS:
        advance, pixel, _ = _KEYWORDS[key]
        return _glyph(advance, pt) if pixel else advance * 100 * pt
    return _glyph(1.0 if not key.isascii() else _FALLBACK_ADVANCE, pt)


def _class(key):
    if key in _DOTS:
        return "dots"
    if key in _KEYWORDS:
        return _KEYWORDS[key][2]
    return _CHAR_CLASS.get(key, "ord")


def _text_atoms(text, pt):
    if text in ("{", "}"):
        return [_Atom(_glyph(_SYMBOL['"{"'], pt), "open" if text == "{" else "close")]
    width = 0
    for ch in text:
        if ch == " ":
            width += math.floor(50 * pt)
        elif ch in "{}":
            width += _glyph(_SYMBOL['"{"'], pt)
        elif ch.isascii():
            width += _glyph(_ROMAN.get(ch, _SYMBOL.get(ch, _FALLBACK_ADVANCE)), pt)
        else:
            width += _glyph(1.0, pt)
    return [_Atom(width)]


def _atoms(items, pt):
    out = []
    for item in items:
        kind = item[0]
        if kind == "glyph":
            key, style = item[1], item[2]
            italic = style == "it" and len(key) == 1 and key.isascii() and key.isalpha()
            out.append(_Atom(_glyph_width(key, style, pt), _class(key), italic=italic))
        elif kind == "text":
            out.extend(_text_atoms(item[1], pt))
        elif kind == "space":
            # ~ and ` count as ordinary atoms: after ",~" a minus is binary, not unary.
            out.append(_Atom(math.floor(item[1] * 100 * pt)))
        elif kind == "restart":
            out.append(_RESTART)
        elif kind == "group":
            out.append(_Atom(_rows(item[1], pt)))
        elif kind == "frac":
            w = max(_width(item[1], pt), _width(item[2], pt)) + 50 * pt
            out.append(_Atom(max(w, 100 * pt), unit=0))
        elif kind == "sqrt":
            out.append(_Atom(_width(item[1], pt) + _even_px(pt) * 75 + 17 * pt, unit=0))
        elif kind == "script":
            small = pt * _SCRIPT_RATIO
            extra = max(_width(item[2], small), _width(item[3], small))
            if item[1][0] == "bare":
                out.append(_Atom(max(extra, 50 * pt), unit=10))   # ^{3} with no base: 0.5em slot
                continue
            base = _atoms([item[1]], pt)
            if not base:
                out.append(_Atom(extra, unit=10))
                continue
            last = base[-1]
            last.width += extra
            if last.unit or item[1][0] == "fence":
                last.unit = 10
            if last.cls in ("open", "close"):
                last.right = "ord"   # (x+2)^{2}: the bracket keeps its gap on the left only
            # A capital's slant shows past its superscript unless an operator,
            # relation or bracket follows (measured A^{C}: +0.15em).
            if item[2] and item[1][0] == "glyph" and item[1][1].isupper() and len(item[1][1]) == 1:
                last.tail = 15 * pt
            last.italic = False
            out.extend(base)
        elif kind == "fence":
            out.append(_Atom(_rows(item[2], pt) + _fence(item[1], pt) + _fence(item[3], pt), unit=0))
        elif kind == "accent":
            word, content = item[1], _width(item[2], pt)
            if word in _OVER_ACCENTS:
                width = content + 10 * pt
            elif word in _HAT_ACCENTS:
                width = max(content, _glyph(.55, pt))
            else:
                width = content
            out.append(_Atom(width, unit=0))
        elif kind == "box":
            content = _width(item[1], pt) if item[1] else _glyph(.5, pt)
            out.append(_Atom(content + 10 * pt, unit=0))
        elif kind == "func":
            out.append(_Atom(sum(_glyph(_ROMAN.get(ch, .5), pt) for ch in item[1]), "func"))
        elif kind == "matrix":
            out.append(_Atom(_matrix(item[1], item[2], pt), unit=0))
    return out


def _fence(delimiter, pt):
    delimiter = delimiter.strip('"')
    if delimiter in ("", "."):
        return 0
    if delimiter in ("(", ")"):
        return _glyph(_SYMBOL["("], pt)
    return _glyph(.5, pt)


def _matrix(kind, rows, pt):
    columns = []
    for row in rows:
        cells, cell = [], []
        for item in row:
            if item[0] == "cell":
                cells.append(cell)
                cell = []
            else:
                cell.append(item)
        cells.append(cell)
        for index, items in enumerate(cells):
            width = _width(items, pt)
            if index < len(columns):
                columns[index] = max(columns[index], width)
            else:
                columns.append(width)
    width = sum(columns) + 20 * pt * max(0, len(columns) - 1)
    if kind == "PMATRIX":
        width += 2 * _glyph(_SYMBOL["("], pt)
    elif kind in ("BMATRIX", "DMATRIX"):
        width += 2 * _glyph(.5, pt)
    elif kind == "CASES":
        width += _glyph(.5, pt)
    return width


def _gap(previous, atom, cls, pt):
    """Space Hancom puts between two adjacent atoms."""
    before = previous.right or previous.cls
    if cls == "bin":
        return 0 if before == "dots" else _space(pt, 2, previous.unit)
    if cls == "unary":
        return 0
    if before in ("bin", "unary"):
        return 0 if cls in ("dots", "rel", "punct") else _space(pt, 2, 7)
    if cls == "rel":
        return 0 if before in ("dots", "open") else _space(pt, 3, previous.unit)
    if before == "rel":
        return 0 if cls in ("dots", "close", "punct") else _space(pt, 3, 7)
    if cls == "dots":
        if before == "punct":
            return _space(pt, 1, 7)
        return 0 if before in ("open", "dots") else _space(pt, 3, previous.unit)
    if before == "dots":
        return 0 if cls in ("punct", "close") else _space(pt, 3, 7)
    if cls in ("close", "open") and before == "ord":
        return _space(pt, 1, previous.unit)
    if before == "punct":
        return _space(pt, 1, 7)
    if cls == "func" and previous.italic:
        return math.floor(12.5 * pt)
    return 0


def _width(items, pt):
    total = 0
    previous = None
    restart = False
    for atom in _atoms([i for i in items if i[0] != "cell"], pt):
        if atom is _RESTART:
            restart = True
            continue
        if restart and previous is not None:
            total += previous.tail
            previous = None
        restart = False
        cls = atom.cls
        if cls == "bin" and (previous is None or (previous.right or previous.cls) in ("bin", "unary", "rel", "open", "punct")):
            cls = atom.cls = "unary"
        if previous is not None:
            if previous.tail and cls not in ("bin", "unary", "rel", "open", "close"):
                total += previous.tail
            total += _gap(previous, atom, cls, pt)
        total += atom.width
        previous = atom
    if previous is not None:
        total += previous.tail
    return total


def _rows(rows, pt):
    return max((_width(items, pt) for items in rows), default=0)


def hwpeq_width(script: str, base_unit: int) -> int:
    """HWPUNIT width Hancom gives ``script`` at ``base_unit`` (1000 = 10pt)."""
    pt = max(base_unit, 1) / 100
    return max(1, round(_rows(_Parser(script).sequence(), pt)))
