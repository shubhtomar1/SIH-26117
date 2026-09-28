"""Safe calculator — AST parsing only, never eval() on user input."""
import ast
import operator
from typing import Any

from app.tools import register_tool
from app.tools.base import BaseTool

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _eval(node: ast.AST) -> Any:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    raise ValueError("Unsupported expression.")


class CalculatorTool(BaseTool):
    name = "calculator"
    description = "Evaluate basic arithmetic expressions safely."

    def execute(self, input_data: dict) -> dict:
        expr = str(input_data.get("expression", ""))[:200]
        try:
            result = _eval(ast.parse(expr, mode="eval"))
            return {"status": "passed", "expression": expr, "result": result}
        except Exception as exc:
            return {"status": "failed", "expression": expr, "error": str(exc)}


register_tool(CalculatorTool())
