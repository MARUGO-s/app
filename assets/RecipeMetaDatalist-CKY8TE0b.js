const a=`import React from 'react';

export const RecipeMetaDatalist = ({ id, values }) => (
    <datalist id={id}>
        {(values || []).map((value) => (
            <option key={\`\${id}-\${value}\`} value={value} />
        ))}
    </datalist>
);
`;export{a as default};
