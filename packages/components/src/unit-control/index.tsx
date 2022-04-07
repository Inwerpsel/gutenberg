/**
 * External dependencies
 */
import type {
	KeyboardEvent,
	ForwardedRef,
	ChangeEvent,
	PointerEvent,
	ClipboardEvent,
} from 'react';
import { omit } from 'lodash';
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import deprecated from '@wordpress/deprecated';
import { forwardRef, useMemo, useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import type { WordPressComponentProps } from '../ui/context';
import { Root, ValueInput } from './styles/unit-control-styles';
import UnitSelectControl from './unit-select-control';
import {
	CSS_UNITS,
	getParsedQuantityAndUnit,
	getUnitsWithCurrentUnit,
	getValidParsedQuantityAndUnit,
	parseQuantityAndUnitFromRawValue,
} from './utils';
import { useControlledState } from '../utils/hooks';
import type { UnitControlProps, UnitControlOnChangeCallback } from './types';

function UnforwardedUnitControl(
	unitControlProps: WordPressComponentProps<
		UnitControlProps,
		'input',
		false
	>,
	forwardedRef: ForwardedRef< any >
) {
	const {
		__unstableStateReducer,
		autoComplete = 'off',
		className,
		disabled = false,
		disableUnits = false,
		isPressEnterToChange = false,
		isResetValueOnUnitChange = false,
		isUnitSelectTabbable = true,
		label,
		onChange: onChangeProp,
		onUnitChange,
		size = 'default',
		style,
		unit: unitProp,
		units: unitsProp = CSS_UNITS,
		value: valueProp,
		...props
	} = unitControlProps;

	if ( 'unit' in unitControlProps ) {
		deprecated( 'UnitControl unit prop', {
			since: '5.6',
			hint: 'The unit should be provided within the `value` prop.',
			version: '6.2',
		} );
	}

	// The `value` prop, in theory, should not be `null`, but the following line
	// ensures it fallback to `undefined` in case a consumer of `UnitControl`
	// still passes `null` as a `value`.
	const nonNullValueProp = valueProp ?? undefined;
	const [ units, reFirstCharacterOfUnits ] = useMemo( () => {
		const list = getUnitsWithCurrentUnit(
			nonNullValueProp,
			unitProp,
			unitsProp
		);
		const firstCharacters = list.reduce( ( carry, { value } ) => {
			const first = value.substr( 0, 1 );
			return carry.includes( first ) ? carry : `${ carry }|${ first }`;
		}, list[ 0 ]?.value.substr( 0, 1 ) );
		return [ list, new RegExp( `^(?:${ firstCharacters })$`, 'i' ) ];
	}, [ nonNullValueProp, unitProp, unitsProp ] );
	const [ parsedQuantity, parsedUnit ] = getParsedQuantityAndUnit(
		nonNullValueProp,
		unitProp,
		units
	);

	const [ unit, setUnit ] = useControlledState< string | undefined >(
		unitProp,
		{
			initial: parsedUnit,
			fallback: '',
		}
	);

	useEffect( () => {
		if ( parsedUnit !== undefined ) {
			setUnit( parsedUnit );
		}
	}, [ parsedUnit ] );

	const classes = classnames( 'components-unit-control', className );

	const handleOnQuantityChange = (
		nextQuantityValue: number | string | undefined,
		changeProps: {
			event:
				| ChangeEvent< HTMLInputElement >
				| PointerEvent< HTMLInputElement >
				| ClipboardEvent< HTMLInputElement >;
		}
	) => {
		if (
			nextQuantityValue === '' ||
			typeof nextQuantityValue === 'undefined' ||
			nextQuantityValue === null
		) {
			onChangeProp?.( '', changeProps );
			return;
		}

		/*
		 * Customizing the onChange callback.
		 * This allows as to broadcast a combined value+unit to onChange.
		 */
		const onChangeValue = getValidParsedQuantityAndUnit(
			nextQuantityValue,
			units,
			parsedQuantity,
			unit
		).join( '' );

		onChangeProp?.( onChangeValue, changeProps );
	};

	const handleOnUnitChange: UnitControlOnChangeCallback = (
		nextUnitValue,
		changeProps
	) => {
		const { data } = changeProps;

		let nextValue = `${ parsedQuantity ?? '' }${ nextUnitValue }`;

		if ( isResetValueOnUnitChange && data?.default !== undefined ) {
			nextValue = `${ data.default }${ nextUnitValue }`;
		}

		onChangeProp?.( nextValue, changeProps );
		onUnitChange?.( nextUnitValue, changeProps );

		setUnit( nextUnitValue );
	};

	let handleOnKeyDown, onPaste;
	if ( ! disableUnits && isUnitSelectTabbable && units.length ) {
		handleOnKeyDown = ( event: KeyboardEvent< HTMLInputElement > ) => {
			props.onKeyDown?.( event );
			// Bails if the meta key is pressed to not interfere with shortcuts,
			// the prime example being pastes.
			if ( event.metaKey ) return;
			// Does the key match the first character of any units?
			if ( reFirstCharacterOfUnits.test( event.key ) ) {
				// Moves focus to the UnitSelectControl.
				refInputSuffix.current?.focus();
			}
		};
		onPaste = ( event: ClipboardEvent< HTMLInputElement > ) => {
			props.onPaste?.( event );
			const pastedText = event.clipboardData.getData( 'text' );
			const parsed = parseQuantityAndUnitFromRawValue(
				pastedText,
				units
			);
			// If no unit parsed, returns early to let the default paste happen.
			if ( ! parsed[ 1 ] ) return;
			const [ quantityPasted, unitPasted ] = parsed;
			event.preventDefault();
			const changeProps = {
				event,
				data: units.find( ( item ) => item.value === unitPasted ),
			};

			if ( quantityPasted ) {
				const entry = `${ quantityPasted }`.replace( /^0*/, '' );
				let {
					value,
					selectionStart: headIndex,
					selectionEnd: tailIndex,
				} = event.target as HTMLInputElement;
				headIndex ??= 0;
				tailIndex ??= 0;
				if ( headIndex !== tailIndex ) {
					// Replaces selection with the pasted quantity.
					const selected = value.substring( headIndex, tailIndex );
					value = value.replace( selected, `${ entry }` );
				} else {
					// Inserts the pasted quantity at caret.
					const head = value.substring( 0, headIndex );
					const tail = value.substring( headIndex, value.length );
					value = `${ head }${ entry }${ tail }`;
				}
				onChangeProp?.(
					`${ parseFloat( value ) }${ unitPasted }`,
					changeProps
				);
			}
			// Moves focus to the UnitSelectControl.
			refInputSuffix.current?.focus();

			if ( unitPasted === parsedUnit ) return;
			onUnitChange?.( unitPasted, changeProps );
			setUnit( unitPasted );
		};
	}

	const refInputSuffix = useRef< HTMLSelectElement >( null );
	const inputSuffix = ! disableUnits ? (
		<UnitSelectControl
			ref={ refInputSuffix }
			aria-label={ __( 'Select unit' ) }
			disabled={ disabled }
			isUnitSelectTabbable={ isUnitSelectTabbable }
			onChange={ handleOnUnitChange }
			size={ size }
			unit={ unit }
			units={ units }
			onBlur={ unitControlProps.onBlur }
		/>
	) : null;

	let step = props.step;

	/*
	 * If no step prop has been passed, lookup the active unit and
	 * try to get step from `units`, or default to a value of `1`
	 */
	if ( ! step && units ) {
		const activeUnit = units.find( ( option ) => option.value === unit );
		step = activeUnit?.step ?? 1;
	}

	return (
		<Root className="components-unit-control-wrapper" style={ style }>
			<ValueInput
				aria-label={ label }
				type="text"
				{ ...omit( props, [ 'children' ] ) }
				autoComplete={ autoComplete }
				className={ classes }
				disabled={ disabled }
				disableUnits={ disableUnits }
				isPressEnterToChange={ isPressEnterToChange }
				label={ label }
				onKeyDown={ handleOnKeyDown }
				onChange={ handleOnQuantityChange }
				onPaste={ onPaste }
				ref={ forwardedRef }
				size={ size }
				suffix={ inputSuffix }
				value={ parsedQuantity ?? '' }
				step={ step }
				__unstableStateReducer={ __unstableStateReducer }
			/>
		</Root>
	);
}

/**
 * `UnitControl` allows the user to set a numeric quantity as well as a unit (e.g. `px`).
 *
 *
 * @example
 * ```jsx
 * import { __experimentalUnitControl as UnitControl } from '@wordpress/components';
 * import { useState } from '@wordpress/element';
 *
 * const Example = () => {
 *   const [ value, setValue ] = useState( '10px' );
 *
 *   return <UnitControl onChange={ setValue } value={ value } />;
 * };
 * ```
 */
export const UnitControl = forwardRef( UnforwardedUnitControl );

export { parseQuantityAndUnitFromRawValue, useCustomUnits } from './utils';
export default UnitControl;
