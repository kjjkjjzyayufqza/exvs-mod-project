import React, { ReactNode } from 'react';

interface ContainerProps {
    children: ReactNode;
}

export default function Container({ children }: ContainerProps) {
    return (
        <div className='container mx-auto px-4'>
            {children}
        </div>
    );
}
