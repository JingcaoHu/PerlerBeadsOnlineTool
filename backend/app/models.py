from typing import Literal
from pydantic import BaseModel, Field, model_validator
from .palette import BY_CODE

class Pattern(BaseModel):
    """Row-major bead matrix. None is an empty peg, never a white bead."""
    version: Literal[1] = 1
    name: str = Field(default='My pattern', max_length=80)
    width: int = Field(ge=1, le=200)
    height: int = Field(ge=1, le=200)
    cells: list[list[str | None]] = Field(max_length=200)

    @model_validator(mode='after')
    def validate_matrix(self):
        if len(self.cells) != self.height or any(len(row) != self.width for row in self.cells):
            raise ValueError('Matrix dimensions must match width and height')
        for row in self.cells:
            for code in row:
                if code is not None and code not in BY_CODE:
                    raise ValueError(f'Unknown Perler color: {code}')
        return self

class ExportRequest(BaseModel):
    pattern: Pattern
    mode: Literal['readable', 'actual'] = 'readable'
    bead_mm: float = Field(default=2.6, ge=2, le=10)
    show_codes: bool = True
    monochrome: bool = False
    spare_percent: int = Field(default=10, ge=0, le=50)
